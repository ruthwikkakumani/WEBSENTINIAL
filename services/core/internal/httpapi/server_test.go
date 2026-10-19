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
