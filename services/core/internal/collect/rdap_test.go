package collect

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRegistryDoesNotFollowRedirects(t *testing.T) {
	contacted := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contacted = true
		w.Write([]byte(`{"found":true}`))
	}))
	defer target.Close()
	registry := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer registry.Close()
	result := (Registry{Base: registry.URL}).Fetch(context.Background(), "example.invalid")
	if contacted {
		t.Fatal("registry followed a redirect outside its configured endpoint")
	}
	if result.Found || result.Error == "" {
		t.Fatal("expected unavailable registration on redirect")
	}
}

func TestRegistryBaseIsOnlyLoopbackOrigin(t *testing.T) {
	for _, base := range []string{"http://127.0.0.1:8082", "http://localhost:8082", "http://[::1]:8082"} {
		if validateBase(base) != nil {
			t.Errorf("valid base rejected: %s", base)
		}
	}
	for _, base := range []string{"http://rdap:8082", "https://127.0.0.1:8082", "http://user:password@127.0.0.1:8082", "http://127.0.0.1:8082/path", "http://127.0.0.1:8082?x=1", "http://127.0.0.1:8082#fragment"} {
		if validateBase(base) == nil {
			t.Errorf("unsafe base accepted: %s", base)
		}
	}
}
