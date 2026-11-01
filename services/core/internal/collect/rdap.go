package collect

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"websentinel/core/internal/model"
)

// Registry talks only to the local Java RDAP service. The domain name is a
// query parameter. This client never receives the user's original URL.
type Registry struct {
	Base string
}

// Health checks the same loopback-only origin as Fetch. A redirect or an
// unrelated HTTP 200 response is not evidence that the registry is ready.
func (r Registry) Health(ctx context.Context) bool {
	if validateBase(r.Base) != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(ctx, 700*time.Millisecond)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(r.Base, "/")+"/health", nil)
	if err != nil {
		return false
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Timeout:       700 * time.Millisecond,
		Transport:     transport,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2049))
	if err != nil || len(body) > 2048 {
		return false
	}
	var health struct {
		Service string `json:"service"`
		Status  string `json:"status"`
	}
	return json.Unmarshal(body, &health) == nil && health.Service == "rdap" && health.Status == "ok"
}

func (r Registry) Fetch(ctx context.Context, domain string) *model.Registration {
	if domain == "" || net.ParseIP(domain) != nil {
		return &model.Registration{Error: "This host has no domain registration record."}
	}
	if err := validateBase(r.Base); err != nil {
		return &model.Registration{Error: "The registry service is not configured on this computer."}
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	endpoint := strings.TrimRight(r.Base, "/") + "/v1/domain?name=" + url.QueryEscape(domain)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return &model.Registration{Error: "The registry request could not be built."}
	}
	client := &http.Client{
		Timeout:       15 * time.Second,
		Transport:     &http.Transport{Proxy: nil},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Do(req)
	if err != nil {
		return &model.Registration{Error: "The registry service on this computer did not answer."}
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return &model.Registration{Error: "The registry response could not be read."}
	}
	var out model.Registration
	if err := json.Unmarshal(body, &out); err != nil {
		return &model.Registration{Error: "The registry response could not be read."}
	}
	if resp.StatusCode >= 400 && out.Error == "" {
		out.Error = "The registry service returned an error."
	}
	return &out
}

func validateBase(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" || u.Host == "" || u.User != nil ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return errBadBase
	}
	if h := u.Hostname(); h != "127.0.0.1" && h != "localhost" && h != "::1" {
		return errBadBase
	}
	return nil
}

var errBadBase = errString("rdap base")

type errString string

func (e errString) Error() string { return string(e) }
