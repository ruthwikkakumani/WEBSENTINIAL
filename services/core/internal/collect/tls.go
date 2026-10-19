package collect

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"net"
	"time"

	"websentinel/core/internal/model"
)

// Certificate handshakes on port 443 and records the leaf even when
// verification fails. Skip-verify is limited to this handshake so the bytes
// can be read; Valid is set only by a separate check against the system roots.
func Certificate(ctx context.Context, host string) *model.Certificate {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	raw, err := dialPinned(ctx, host, "443")
	if err != nil {
		return &model.Certificate{Error: explain(err)}
	}
	defer raw.Close()
	_ = raw.SetDeadline(time.Now().Add(8 * time.Second))

	cfg := &tls.Config{
		InsecureSkipVerify: true, // read the leaf even when it will not verify; Valid is decided below
		MinVersion:         tls.VersionTLS10,
	}
	if net.ParseIP(host) == nil {
		cfg.ServerName = host
	}
	conn := tls.Client(raw, cfg)
	if err := conn.HandshakeContext(ctx); err != nil {
		return &model.Certificate{Error: explain(err)}
	}
	defer conn.Close()

	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return &model.Certificate{Checked: true, Error: "the server presented no certificate"}
	}
	leaf := state.PeerCertificates[0]
	out := &model.Certificate{
		Checked:    true,
		Protocol:   protocolName(state.Version),
		Cipher:     tls.CipherSuiteName(state.CipherSuite),
		Issuer:     party(leaf.Issuer),
		Subject:    party(leaf.Subject),
		NotBefore:  leaf.NotBefore.UTC().Format(time.RFC3339),
		NotAfter:   leaf.NotAfter.UTC().Format(time.RFC3339),
		DaysLeft:   int(time.Until(leaf.NotAfter).Hours() / 24),
		SelfSigned: leaf.CheckSignatureFrom(leaf) == nil,
		NameCount:  len(leaf.DNSNames),
	}
	for i, name := range leaf.DNSNames {
		if i == 8 {
			break
		}
		out.Names = append(out.Names, name)
	}
	if ip := net.ParseIP(host); ip != nil {
		out.NameCount = len(leaf.IPAddresses)
	}

	roots, err := x509.SystemCertPool()
	if err != nil || roots == nil {
		roots = x509.NewCertPool()
	}
	inter := x509.NewCertPool()
	for _, cert := range state.PeerCertificates[1:] {
		inter.AddCert(cert)
	}
	_, verr := leaf.Verify(x509.VerifyOptions{
		DNSName:       host,
		Intermediates: inter,
		Roots:         roots,
		CurrentTime:   time.Now(),
	})
	if verr != nil {
		out.Valid = false
		out.Error = verr.Error()
		return out
	}
	out.Valid = true
	return out
}

func protocolName(v uint16) string {
	switch v {
	case tls.VersionTLS13:
		return "TLS 1.3"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS10:
		return "TLS 1.0"
	default:
		return "unknown"
	}
}

func party(n pkix.Name) string {
	if len(n.Organization) > 0 && n.Organization[0] != "" {
		return n.Organization[0]
	}
	if n.CommonName != "" {
		return n.CommonName
	}
	s := n.String()
	if len(s) > 160 {
		return s[:160]
	}
	return s
}
