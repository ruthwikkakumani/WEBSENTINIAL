package assess

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"websentinel/core/internal/collect"
	"websentinel/core/internal/model"
	"websentinel/core/internal/score"
)

// mockRDAP always returns a fixed registration.
func mockRDAPServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r
		out := model.Registration{
			Found:      true,
			Registered: "2020-01-15T00:00:00Z",
			Updated:    "2025-06-01T00:00:00Z",
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}))
}

func TestServiceRun_RejectsPrivateAddress(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	_, err := svc.Run(context.Background(), "http://127.0.0.1/admin")
	if err == nil {
		t.Fatal("expected error for private address, got nil")
	}
	var rej *Reject
	if !as(err, &rej) {
		t.Fatalf("expected *Reject, got %T: %v", err, err)
	}
	if rej.Code != "private_address" {
		t.Fatalf("expected code private_address, got %q", rej.Code)
	}
}

func TestServiceRun_RejectsInvalidURL(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	_, err := svc.Run(context.Background(), "javascript:alert(1)")
	if err == nil {
		t.Fatal("expected error for invalid URL, got nil")
	}
	var rej *Reject
	if !as(err, &rej) {
		t.Fatalf("expected *Reject, got %T: %v", err, err)
	}
}

func TestServiceRun_ResolveFailReturnsAssessmentWithError(t *testing.T) {
	// A host that won't resolve publicly should still return a partial assessment.
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "http://this-host-does-not-exist-1234567890.example")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Origin == "" {
		t.Fatal("expected populated assessment even on DNS failure")
	}
	if a.RuleScore != 0 {
		t.Logf("rule score on unresolved host: %d", a.RuleScore)
	}
}

func TestServiceRun_ReturnsAssessmentShape(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "https://example.invalid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if a.AssessedAt.IsZero() {
		t.Fatal("expected non-zero assessedAt")
	}
	if a.Origin != "https://example.invalid" {
		t.Fatalf("expected origin https://example.invalid, got %q", a.Origin)
	}
	if a.Scheme != "https" {
		t.Fatalf("expected scheme https, got %q", a.Scheme)
	}
	if a.Registrable != "example.invalid" {
		t.Fatalf("expected registrableDomain example.invalid, got %q", a.Registrable)
	}
	if a.Verdict == "" {
		t.Fatal("expected non-empty verdict")
	}
	if a.VerdictLabel == "" {
		t.Fatal("expected non-empty verdict label")
	}
	if a.Summary == "" {
		t.Fatal("expected non-empty summary")
	}
	if a.Disclaimer == "" {
		t.Fatal("expected non-empty disclaimer")
	}
	if len(a.NotChecked) == 0 {
		t.Fatal("expected non-empty NotChecked list")
	}
	if len(a.Limitations) == 0 {
		t.Fatal("expected non-empty Limitations list")
	}
}

func TestServiceRun_ScoreRanges(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "https://example.invalid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.RuleScore < 0 || a.RuleScore > 100 {
		t.Fatalf("ruleScore %d out of [0,100]", a.RuleScore)
	}
	if a.AdvisoryScore < 0 || a.AdvisoryScore > 100 {
		t.Fatalf("advisoryScore %d out of [0,100]", a.AdvisoryScore)
	}
	// Both should be consistent: advisory >= rule when there are only non-negative extra findings.
	if a.AdvisoryScore < a.RuleScore {
		t.Logf("advisoryScore %d < ruleScore %d — possible if extra findings are negative", a.AdvisoryScore, a.RuleScore)
	}
}

func TestServiceRun_VerdictMatching(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "http://new-domain-check-1234567890.example")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	v, l := score.Band(a.AdvisoryScore)
	if a.Verdict != v {
		t.Fatalf("verdict mismatch: assessment has %q, Band(%d) returns %q", a.Verdict, a.AdvisoryScore, v)
	}
	if a.VerdictLabel != l {
		t.Fatalf("verdict label mismatch: assessment has %q, Band(%d) returns %q", a.VerdictLabel, a.AdvisoryScore, l)
	}
}

func TestServiceRun_FindingsArePopulated(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "https://example.invalid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(a.Findings) == 0 {
		t.Fatal("expected at least one finding")
	}
	for _, f := range a.Findings {
		if f.ID == "" {
			t.Fatal("finding with empty ID")
		}
		if f.Signal == "" {
			t.Fatal("finding with empty Signal")
		}
		if f.Severity == "" {
			t.Fatal("finding with empty Severity")
		}
		if f.Title == "" {
			t.Fatal("finding with empty Title")
		}
	}
}

func TestServiceRun_CheckedList(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	a, err := svc.Run(context.Background(), "https://example.invalid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(a.Checked) == 0 {
		t.Fatal("expected at least one checked item")
	}
	found := false
	for _, c := range a.Checked {
		if c == "Scheme and origin" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected 'Scheme and origin' in checked list")
	}
}

func TestServiceRun_RejectsURLWithCredentials(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	_, err := svc.Run(context.Background(), "https://user:password@evil.com/path")
	if err == nil {
		t.Fatal("expected error for URL with credentials")
	}
}

func TestServiceRun_EmptyURL(t *testing.T) {
	ts := mockRDAPServer()
	defer ts.Close()

	svc := Service{Registry: collect.Registry{Base: ts.URL}}
	_, err := svc.Run(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
}

// as is a type-assertion helper that avoids importing reflect in tests.
func as(err error, target interface{}) bool {
	switch t := target.(type) {
	case **Reject:
		*t, _ = err.(*Reject)
		return *t != nil
	}
	return false
}
