package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"websentinel/core/internal/assess"
	"websentinel/core/internal/collect"
)

func TestRefusalsDoNotEchoSecrets(t *testing.T) {
	srv := New(assess.Service{Registry: collect.Registry{Base: "http://127.0.0.1:8082"}}, nil, "http://127.0.0.1:8082")
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	cases := []string{
		`{"url":"http://127.0.0.1/admin?token=supersecret"}`,
		`{"url":"https://user:s3cret@example.com/path"}`,
		`{"url":"http://169.254.169.254/latest/meta-data"}`,
		`{"url":"javascript:alert(1)"}`,
	}
	for _, body := range cases {
		res, err := http.Post(ts.URL+"/api/v1/assess", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := io.ReadAll(res.Body)
		res.Body.Close()
		text := string(raw)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("status %d body %s", res.StatusCode, text)
		}
		for _, secret := range []string{"supersecret", "s3cret", "meta-data", "alert"} {
			if strings.Contains(text, secret) {
				t.Fatalf("response echoed %q in %s", secret, text)
			}
		}
	}
}

func TestRDAPHealthRequiresRegistryIdentity(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   bool
	}{
		{"ready", 200, `{"service":"rdap","status":"ok"}`, true},
		{"wrong service", 200, `{"service":"other","status":"ok"}`, false},
		{"down", 200, `{"service":"rdap","status":"down"}`, false},
		{"empty", 200, ``, false},
		{"malformed", 200, `{`, false},
		{"oversized", 200, strings.Repeat(" ", 2049) + `{"service":"rdap","status":"ok"}`, false},
		{"unavailable", 503, `{"service":"rdap","status":"ok"}`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/health" || r.Method != http.MethodGet {
					t.Errorf("unexpected registry request: %s %s", r.Method, r.URL.Path)
				}
				w.WriteHeader(tc.status)
				io.WriteString(w, tc.body)
			}))
			defer ts.Close()
			srv := New(assess.Service{}, nil, ts.URL)
			if got := srv.rdapUp(); got != tc.want {
				t.Fatalf("rdapUp() = %v, want %v", got, tc.want)
			}
			response := httptest.NewRecorder()
			srv.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))
			state := "down"
			if tc.want {
				state = "ok"
			}
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"rdap":"`+state+`"`) {
				t.Fatalf("health API misrepresented registry state: %d %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestRDAPHealthNeverFollowsRedirects(t *testing.T) {
	contacted := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contacted = true
		io.WriteString(w, `{"service":"rdap","status":"ok"}`)
	}))
	defer target.Close()
	registry := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer registry.Close()
	if New(assess.Service{}, nil, registry.URL).rdapUp() || contacted {
		t.Fatal("health accepted or followed a redirect")
	}
}

func TestRDAPHealthRejectsNonOriginConfiguration(t *testing.T) {
	contacted := false
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contacted = true
		io.WriteString(w, `{"service":"rdap","status":"ok"}`)
	}))
	defer ts.Close()
	for _, base := range []string{ts.URL + "/nested", ts.URL + "?token=secret", ts.URL + "#fragment", "http://user:secret@" + strings.TrimPrefix(ts.URL, "http://"), "http://169.254.169.254"} {
		if New(assess.Service{}, nil, base).rdapUp() {
			t.Error("health accepted non-origin registry configuration")
		}
	}
	if contacted {
		t.Fatal("health contacted registry with invalid base")
	}
}
