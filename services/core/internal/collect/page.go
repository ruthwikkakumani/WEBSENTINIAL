package collect

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"websentinel/core/internal/guard"
	"websentinel/core/internal/model"
)

// Page performs an unauthenticated GET and follows at most five redirects.
// Each hop is checked again. Only origins are kept.
func Page(ctx context.Context, origin, registrable string) *model.Page {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	out := &model.Page{Hops: []model.Hop{}}
	client := &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: &http.Transport{
			Proxy:                 nil,
			DialContext:           dialContext,
			TLSHandshakeTimeout:   8 * time.Second,
			ResponseHeaderTimeout: 8 * time.Second,
			TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
			ForceAttemptHTTP2:     true,
			DisableKeepAlives:     true,
		},
	}

	current := origin + "/"
	for hop := 0; hop < 5; hop++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, current, nil)
		if err != nil {
			out.Error = "The address could not be requested."
			return out
		}
		req.Header.Set("User-Agent", "WebSentinel/1.0 (passive assessment; scripts are not run)")
		req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
		resp, err := client.Do(req)
		if err != nil {
			if errors.Is(err, guard.ErrNonPublic) || errors.Is(err, guard.ErrBlockedName) {
				out.BlockedRedirect = hostOf(current)
				return out
			}
			out.Error = explain(err)
			return out
		}
		loc := resp.Header.Get("Location")
		status := resp.StatusCode
		if isRedirect(status) && loc != "" {
			resp.Body.Close()
			next, blocked, err := nextHop(current, loc)
			out.Hops = append(out.Hops, model.Hop{Origin: originOf(current), Status: status})
			if blocked != "" || err != nil {
				if blocked == "" {
					blocked = "a non-public address"
				}
				out.BlockedRedirect = blocked
				return out
			}
			current = next.Origin + "/"
			continue
		}
		out.FinalOrigin = originOf(current)
		out.Headers = interesting(resp.Header)
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()
		out.Title = extractTitle(body)
		if final, err := guard.Normalize(current); err == nil && !sameSite(registrable, final.Registrable) && len(out.Hops) > 0 {
			out.CrossSite = true
		}
		return out
	}
	out.Error = "Stopped after 5 redirects."
	return out
}

func dialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, guard.ErrNonPublic
	}
	return dialPinned(ctx, host, port)
}

func nextHop(current, location string) (guard.Decision, string, error) {
	base, err := url.Parse(current)
	if err != nil {
		return guard.Decision{}, "", err
	}
	ref, err := url.Parse(location)
	if err != nil {
		return guard.Decision{}, "", err
	}
	abs := base.ResolveReference(ref)
	host := abs.Hostname()
	d, err := guard.Normalize(abs.String())
	if err != nil {
		return guard.Decision{}, host, err
	}
	return d, "", nil
}

func isRedirect(code int) bool {
	return code == 301 || code == 302 || code == 303 || code == 307 || code == 308
}

func interesting(h http.Header) map[string]string {
	keys := []string{
		"Strict-Transport-Security",
		"Content-Security-Policy",
		"X-Frame-Options",
		"X-Content-Type-Options",
		"Referrer-Policy",
		"Permissions-Policy",
	}
	out := map[string]string{}
	for _, key := range keys {
		v := strings.TrimSpace(h.Get(key))
		if v == "" {
			continue
		}
		if len(v) > 180 {
			v = v[:180] + "…"
		}
		out[key] = v
	}
	return out
}

func extractTitle(body []byte) string {
	lower := bytes.ToLower(body)
	start := bytes.Index(lower, []byte("<title"))
	if start < 0 {
		return ""
	}
	gt := bytes.IndexByte(lower[start:], '>')
	if gt < 0 {
		return ""
	}
	rest := body[start+gt+1:]
	end := bytes.Index(bytes.ToLower(rest), []byte("</title>"))
	if end < 0 {
		return ""
	}
	title := html.UnescapeString(string(rest[:end]))
	title = strings.Join(strings.Fields(title), " ")
	if len([]rune(title)) > 140 {
		title = string([]rune(title)[:140]) + "…"
	}
	return title
}

func originOf(raw string) string {
	if d, err := guard.Normalize(raw); err == nil {
		return d.Origin
	}
	return raw
}

func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

func sameSite(a, b string) bool {
	return strings.EqualFold(a, b) || a == "" || b == ""
}
