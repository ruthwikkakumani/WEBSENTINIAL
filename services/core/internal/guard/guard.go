// Package guard decides whether a user-supplied address may be contacted.
// The scanner is a confused deputy: a hostile URL must not become a request
// into loopback, private space, link-local, or cloud metadata.
package guard

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"

	"golang.org/x/net/idna"
	"golang.org/x/net/publicsuffix"
)

// Error is a refusal with a stable code and a message that does not echo the
// raw input. Callers must not wrap it with the original URL.
type Error struct {
	Code string
	Msg  string
}

func (e *Error) Error() string { return e.Msg }

// Decision is the only form of a URL that collectors are allowed to see.
type Decision struct {
	Origin      string
	Scheme      string
	Host        string
	UnicodeHost string
	Port        string
	Registrable string
	Discarded   bool
}

// Sentinels for dial-time refusals. These are checked with errors.Is.
var (
	ErrNonPublic   = errors.New("non-public address")
	ErrBlockedName = errors.New("blocked host")
)

// Normalize parses raw and returns an origin. Path, query, and fragment are
// dropped. Embedded credentials are rejected rather than stripped quietly,
// so a password is never forwarded by accident.
func Normalize(raw string) (Decision, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2048 {
		return Decision{}, &Error{Code: "invalid_url", Msg: "Enter a website address."}
	}
	for _, r := range raw {
		if r < 0x20 || r == 0x7f {
			return Decision{}, &Error{Code: "invalid_url", Msg: "Enter a website address."}
		}
	}
	if scheme, rest, ok := splitScheme(raw); ok {
		if scheme != "http" && scheme != "https" {
			return Decision{}, &Error{Code: "unsupported_scheme", Msg: "Only http and https addresses can be assessed."}
		}
		raw = scheme + "://" + rest
	} else if strings.HasPrefix(raw, "//") {
		raw = "https:" + raw
	} else if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return Decision{}, &Error{Code: "invalid_url", Msg: "Enter a website address."}
	}
	if u.User != nil {
		return Decision{}, &Error{Code: "embedded_credentials", Msg: "This address contains a username or password. It was not sent onward. Remove the credentials and try the host on its own."}
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return Decision{}, &Error{Code: "unsupported_scheme", Msg: "Only http and https addresses can be assessed."}
	}
	host := strings.TrimSuffix(u.Hostname(), ".")
	if host == "" {
		return Decision{}, &Error{Code: "invalid_url", Msg: "Enter a website address."}
	}

	var ascii, unicodeHost string
	if ip := net.ParseIP(host); ip != nil {
		ascii = ip.String()
		unicodeHost = ascii
	} else {
		ascii, err = idna.Lookup.ToASCII(host)
		if err != nil || ascii == "" {
			return Decision{}, &Error{Code: "invalid_url", Msg: "Enter a website address."}
		}
		ascii = strings.ToLower(ascii)
		unicodeHost, err = idna.Lookup.ToUnicode(ascii)
		if err != nil || unicodeHost == "" {
			unicodeHost = ascii
		}
	}

	if blockedName(ascii) {
		return Decision{}, &Error{Code: "blocked_host", Msg: "That hostname is reserved for local networks. It was not contacted."}
	}
	if ip := parseLiteral(ascii); ip != nil {
		if !IsPublic(ip) {
			return Decision{}, &Error{Code: "private_address", Msg: "That host is local, private, or a cloud metadata address. It was not contacted."}
		}
		ascii = ip.String()
		unicodeHost = ascii
	} else if err := validateHostname(ascii); err != nil {
		return Decision{}, err
	}

	port := u.Port()
	switch scheme {
	case "https":
		if port == "" || port == "443" {
			port = "443"
		} else {
			return Decision{}, &Error{Code: "bad_port", Msg: "Only the ordinary web ports, 80 and 443, are contacted."}
		}
	case "http":
		if port == "" || port == "80" {
			port = "80"
		} else {
			return Decision{}, &Error{Code: "bad_port", Msg: "Only the ordinary web ports, 80 and 443, are contacted."}
		}
	}

	reg := ascii
	if parseLiteral(ascii) == nil {
		if etld, err := publicsuffix.EffectiveTLDPlusOne(ascii); err == nil {
			reg = etld
		}
	}

	discarded := (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != ""
	return Decision{
		Origin:      scheme + "://" + originHost(ascii),
		Scheme:      scheme,
		Host:        ascii,
		UnicodeHost: unicodeHost,
		Port:        port,
		Registrable: reg,
		Discarded:   discarded,
	}, nil
}

func originHost(host string) string {
	if ip := net.ParseIP(host); ip != nil && ip.To4() == nil {
		return "[" + ip.String() + "]"
	}
	return host
}

// ResolvePublic looks up host and returns one address to dial. If any answer
// is non-public, the whole name is refused. Callers dial the returned IP
// rather than the name, so a later DNS change cannot redirect the connection.
func ResolvePublic(ctx context.Context, host string) (net.IP, error) {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if blockedName(host) {
		return nil, ErrBlockedName
	}
	if ip := parseLiteral(host); ip != nil {
		if !IsPublic(ip) {
			return nil, ErrNonPublic
		}
		return ip, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errors.New("no addresses")
	}
	var v4, v6 net.IP
	for _, ip := range ips {
		if !IsPublic(ip.IP) {
			return nil, ErrNonPublic
		}
		if ip.IP.To4() != nil && v4 == nil {
			v4 = ip.IP
		}
		if ip.IP.To4() == nil && v6 == nil {
			v6 = ip.IP
		}
	}
	if v4 != nil {
		return v4, nil
	}
	return v6, nil
}

// Control is a net.Dialer hook. It refuses the socket if the address about
// to be connected is not public. Dialers must pass an IP, not a name.
func Control(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if !IsPublic(ip) {
		return fmt.Errorf("%w", ErrNonPublic)
	}
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return fmt.Errorf("%w", ErrNonPublic)
	}
	return nil
}

// IsPublic reports whether ip is a globally routable unicast address we are
// willing to contact. Private, loopback, link-local, multicast, documentation,
// benchmarking, and carrier-grade NAT ranges are refused.
func IsPublic(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() || !ip.IsGlobalUnicast() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		if v4[0] == 0 || v4[0] >= 224 {
			return false
		}
		if in(v4, "100.64.0.0/10") ||
			in(v4, "192.0.0.0/24") ||
			in(v4, "192.0.2.0/24") ||
			in(v4, "192.88.99.0/24") ||
			in(v4, "192.31.196.0/24") ||
			in(v4, "192.52.193.0/24") ||
			in(v4, "192.175.48.0/24") ||
			in(v4, "198.18.0.0/15") ||
			in(v4, "198.51.100.0/24") ||
			in(v4, "203.0.113.0/24") ||
			in(v4, "255.255.255.255/32") {
			return false
		}
		return true
	}
	if in(ip, "2001:db8::/32") || in(ip, "2001:10::/28") {
		return false
	}
	return true
}

func in(ip net.IP, cidr string) bool {
	_, n, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}
	return n.Contains(ip)
}

func parseLiteral(host string) net.IP {
	if ip := net.ParseIP(host); ip != nil {
		return ip
	}
	return weirdIPv4(host)
}

// weirdIPv4 catches decimal and hex forms of an IPv4 address that ParseIP
// leaves as a hostname, such as 2130706433 for 127.0.0.1.
func weirdIPv4(host string) net.IP {
	base := 10
	s := host
	switch {
	case strings.HasPrefix(host, "0x") || strings.HasPrefix(host, "0X"):
		base = 16
		s = host[2:]
	case len(host) > 1 && host[0] == '0' && !strings.Contains(host, "."):
		base = 8
		s = host[1:]
	}
	if s == "" || strings.ContainsAny(s, ".") {
		return nil
	}
	n, err := strconv.ParseUint(s, base, 32)
	if err != nil {
		return nil
	}
	// A decimal hostname that is not an all-digit token was already rejected
	// by the prefix checks. Require the original host to be a pure encoding.
	if base == 10 {
		for _, c := range host {
			if c < '0' || c > '9' {
				return nil
			}
		}
	}
	ip := make(net.IP, 4)
	binary.BigEndian.PutUint32(ip, uint32(n))
	return ip
}

func validateHostname(ascii string) error {
	if len(ascii) > 253 {
		return &Error{Code: "invalid_url", Msg: "Enter a website address."}
	}
	labels := strings.Split(ascii, ".")
	if len(labels) < 2 {
		return &Error{Code: "single_label", Msg: "A single-word host is not a public website name, so it was not contacted."}
	}
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return &Error{Code: "invalid_url", Msg: "Enter a website address."}
		}
		for _, c := range label {
			if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
				return &Error{Code: "invalid_url", Msg: "Enter a website address."}
			}
		}
	}
	return nil
}

func blockedName(host string) bool {
	switch host {
	case "localhost", "localhost.localdomain", "metadata.google.internal", "metadata.internal":
		return true
	}
	for _, suf := range []string{".local", ".localhost", ".internal", ".localdomain", ".home", ".lan", ".arpa"} {
		if strings.HasSuffix(host, suf) {
			return true
		}
	}
	return false
}

func splitScheme(raw string) (string, string, bool) {
	i := strings.Index(raw, ":")
	if i <= 0 || strings.Contains(raw, "://") {
		return "", "", false
	}
	scheme := strings.ToLower(raw[:i])
	if strings.Contains(scheme, ".") {
		return "", "", false
	}
	for _, c := range scheme {
		if !unicode.IsLetter(c) && c != '+' && c != '-' && c != '.' {
			return "", "", false
		}
	}
	rest := raw[i+1:]
	if rest == "" {
		return scheme, "", true
	}
	if n, err := strconv.Atoi(rest); err == nil && n >= 0 && n < 65536 && !strings.Contains(scheme, "+") {
		// host:port, not a scheme. "example.com:443" has a dot and already returned.
		// "localhost:80" lands here and should be treated as a host, not a scheme.
		return "", "", false
	}
	return scheme, rest, true
}
