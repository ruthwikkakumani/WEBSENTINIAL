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
	client := &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{Proxy: nil}}
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
	if err != nil || u.Scheme != "http" || u.Host == "" {
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
