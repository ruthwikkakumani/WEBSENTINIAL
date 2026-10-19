package assess

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"websentinel/core/internal/collect"
	"websentinel/core/internal/guard"
	"websentinel/core/internal/model"
	"websentinel/core/internal/score"
)

// Reject is a user-facing refusal. The message never includes the raw URL.
type Reject struct {
	Code string
	Msg  string
}

func (e *Reject) Error() string { return e.Msg }

// Service runs one assessment.
type Service struct {
	Registry collect.Registry
}

// Run collects public signals and scores them. A non-public target returns
// Reject and is not contacted.
func (s Service) Run(ctx context.Context, raw string) (model.Assessment, error) {
	d, err := guard.Normalize(raw)
	if err != nil {
		var ge *guard.Error
		if errors.As(err, &ge) {
			return model.Assessment{}, &Reject{Code: ge.Code, Msg: ge.Msg}
		}
		return model.Assessment{}, &Reject{Code: "invalid_url", Msg: "Enter a website address."}
	}

	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	ip, err := guard.ResolvePublic(ctx, d.Host)
	var cert *model.Certificate
	var dns *model.DNS
	var reg *model.Registration
	var page *model.Page
	connected := ""

	if err != nil && (errors.Is(err, guard.ErrNonPublic) || errors.Is(err, guard.ErrBlockedName)) {
		return model.Assessment{}, &Reject{
			Code: "private_address",
			Msg:  "That host is local, private, or a cloud metadata address. It was not contacted.",
		}
	}

	regCh := make(chan *model.Registration, 1)
	go func() {
		regCh <- s.Registry.Fetch(ctx, d.Registrable)
	}()

	if err != nil {
		dns = &model.DNS{Error: "This name did not resolve, so the site was not contacted."}
		cert = &model.Certificate{Error: "not contacted"}
		page = &model.Page{Hops: []model.Hop{}, Error: "not contacted"}
	} else {
		connected = ip.String()
		var wg sync.WaitGroup
		wg.Add(3)
		go func() {
			defer wg.Done()
			cert = collect.Certificate(ctx, d.Host)
		}()
		go func() {
			defer wg.Done()
			dns = collect.Lookup(ctx, d.Host, connected, d.Registrable)
		}()
		go func() {
			defer wg.Done()
			page = collect.Page(ctx, d.Origin, d.Registrable)
		}()
		wg.Wait()
	}
	reg = <-regCh
	if reg != nil && reg.Registered != "" {
		if t, perr := time.Parse(time.RFC3339, reg.Registered); perr == nil {
			reg.Age = agePhrase(t, time.Now())
		}
	}

	now := time.Now().UTC()
	scored := score.Score(score.Facts{
		Now:          now,
		Scheme:       d.Scheme,
		Hostname:     d.Host,
		UnicodeHost:  d.UnicodeHost,
		Registrable:  d.Registrable,
		Certificate:  cert,
		DNS:          dns,
		Registration: reg,
		Page:         page,
	})

	findings := scored.Findings
	if findings == nil {
		findings = []model.Finding{}
	}
	a := model.Assessment{
		ID:            newID(),
		AssessedAt:    now,
		Origin:        d.Origin,
		Scheme:        d.Scheme,
		Hostname:      d.Host,
		Registrable:   d.Registrable,
		DiscardedPath: d.Discarded,
		ConnectedTo:   connected,
		RuleScore:     scored.Rule,
		AdvisoryScore: scored.Advisory,
		Verdict:       scored.Verdict,
		VerdictLabel:  scored.Label,
		Summary:       scored.Summary,
		Disclaimer:    model.Disclaimer,
		Findings:      findings,
		Checked:       checked(cert, dns, reg, page),
		NotChecked: []string{
			"Page scripts, layout, and images",
			"Logos and visual brand matching",
			"Account names, passwords, or cookies",
			"A learned phishing probability",
			"Whether the organization behind the site is real",
		},
		Limitations:  limitations(cert, dns, reg, page),
		Certificate:  cert,
		DNS:          dns,
		Registration: reg,
		Page:         page,
	}
	return a, nil
}

func checked(cert *model.Certificate, dns *model.DNS, reg *model.Registration, page *model.Page) []string {
	out := []string{"Scheme and origin", "Hostname shape"}
	if cert != nil && cert.Checked {
		out = append(out, "TLS certificate on port 443")
	}
	if reg != nil && reg.Found {
		out = append(out, "Registry record (RDAP)")
	}
	if dns != nil && dns.Error == "" && (len(dns.Addresses) > 0 || len(dns.Nameservers) > 0) {
		out = append(out, "Public DNS records")
	}
	if page != nil && page.Error == "" && page.BlockedRedirect == "" {
		out = append(out, "HTTP headers and redirects")
	}
	return out
}

func limitations(cert *model.Certificate, dns *model.DNS, reg *model.Registration, page *model.Page) []string {
	out := []string{
		"The score is an uncalibrated advisory. It is not a measured detection rate.",
		"No page scripts were run, so the site can still change after it loads.",
		"A valid certificate does not mean the site is who it claims to be.",
	}
	if reg == nil || (!reg.Found && reg.Error != "") {
		out = append(out, "Registration data was incomplete for this name, so age may be missing from the score.")
	}
	if dns != nil && dns.Error != "" {
		out = append(out, "DNS did not answer completely.")
	}
	if page != nil && page.Error != "" && page.Error != "not contacted" {
		out = append(out, "Page headers could not be read. The certificate result still stands on its own.")
	}
	if cert != nil && !cert.Checked && cert.Error != "" && cert.Error != "not contacted" && cert.Error != "non-public" {
		out = append(out, "The TLS handshake did not finish.")
	}
	return out
}

func agePhrase(t, now time.Time) string {
	if t.After(now) {
		return "a future date"
	}
	days := int(now.Sub(t).Hours() / 24)
	switch {
	case days < 1:
		return "less than a day"
	case days == 1:
		return "1 day"
	case days < 60:
		return strings.TrimSpace(itoa(days) + " days")
	case days < 730:
		return itoa(days/30) + " months"
	default:
		return itoa(days/365) + " years"
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [16]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func newID() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "WS-00000000"
	}
	return "WS-" + strings.ToUpper(hex.EncodeToString(b[:]))
}
