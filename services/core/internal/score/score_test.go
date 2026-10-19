package score

import (
	"testing"
	"time"

	"websentinel/core/internal/model"
)

func TestBands(t *testing.T) {
	cases := []struct {
		n int
		v string
	}{
		{0, "safe"}, {23, "safe"}, {24, "suspicious"}, {58, "suspicious"}, {59, "high_risk"}, {100, "high_risk"},
	}
	for _, tc := range cases {
		got, _ := Band(tc.n)
		if got != tc.v {
			t.Errorf("Band(%d) = %s, want %s", tc.n, got, tc.v)
		}
	}
}

func TestPaperRules(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	reg := now.AddDate(0, 0, -3).Format(time.RFC3339)
	upd := now.AddDate(0, 0, -1).Format(time.RFC3339)
	// HTTP + invalid cert + age under 7 days + update under 7 days = 20+20+35+10 = 85.
	got := Score(Facts{
		Now: now, Scheme: "http", Hostname: "new.example",
		Certificate:  &model.Certificate{Checked: true, Valid: false, Error: "expired"},
		Registration: &model.Registration{Found: true, Registered: reg, Updated: upd, DNSSECKnown: true, DNSSEC: true},
	})
	if got.Rule != 85 {
		t.Fatalf("rule = %d, want 85 (DNSSEC bonus must not apply without HTTPS)", got.Rule)
	}
	if got.Verdict != "high_risk" {
		t.Fatalf("verdict %s", got.Verdict)
	}

	old := now.AddDate(-20, 0, 0).Format(time.RFC3339)
	quiet := Score(Facts{
		Now: now, Scheme: "https", Hostname: "example.com", UnicodeHost: "example.com", Registrable: "example.com",
		Certificate: &model.Certificate{Checked: true, Valid: true, DaysLeft: 90, Issuer: "Example CA", Protocol: "TLS 1.3"},
		Registration: &model.Registration{
			Found: true, Registered: old, Updated: now.AddDate(-1, 0, 0).Format(time.RFC3339),
			DNSSECKnown: true, DNSSEC: true,
		},
	})
	if quiet.Rule != 0 {
		t.Fatalf("established HTTPS DNSSEC rule = %d, want 0 after the 3 point bonus is clamped", quiet.Rule)
	}
	if quiet.Verdict != "safe" {
		t.Fatalf("verdict %s", quiet.Verdict)
	}

	// Age buckets are mutually exclusive: 3 days is 35, not 35+25+15+8.
	if w := ageWeight(3); w != 35 {
		t.Fatal(w)
	}
	if w := ageWeight(10); w != 25 {
		t.Fatal(w)
	}
	if w := ageWeight(40); w != 15 {
		t.Fatal(w)
	}
	if w := ageWeight(200); w != 8 {
		t.Fatal(w)
	}
	if w := ageWeight(400); w != 0 {
		t.Fatal(w)
	}
	if w := updateWeight(2); w != 10 {
		t.Fatal(w)
	}
	if w := updateWeight(12); w != 6 {
		t.Fatal(w)
	}
}

func TestExtendedSignalsStayOutOfTheRuleScore(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	old := now.AddDate(-10, 0, 0).Format(time.RFC3339)
	got := Score(Facts{
		Now: now, Scheme: "https",
		Hostname: "paypal.example.com", UnicodeHost: "paypal.example.com", Registrable: "example.com",
		Certificate:  &model.Certificate{Checked: true, Valid: true, DaysLeft: 40, Protocol: "TLS 1.3"},
		Registration: &model.Registration{Found: true, Registered: old, DNSSECKnown: true},
	})
	if got.Rule != 0 {
		t.Fatalf("brand lookalike leaked into rule score: %d", got.Rule)
	}
	if got.Advisory < 24 || got.Verdict != "suspicious" {
		t.Fatalf("advisory=%d verdict=%s, want suspicious from the brand observation alone", got.Advisory, got.Verdict)
	}
}

func TestLookalikes(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	old := now.AddDate(-5, 0, 0).Format(time.RFC3339)
	base := func(host, uni, reg string) Facts {
		return Facts{
			Now: now, Scheme: "https", Hostname: host, UnicodeHost: uni, Registrable: reg,
			Certificate:  &model.Certificate{Checked: true, Valid: true, DaysLeft: 40, Protocol: "TLS 1.3"},
			Registration: &model.Registration{Found: true, Registered: old},
		}
	}
	if items := hostFindings(base("appleton.com", "appleton.com", "appleton.com")); len(items) != 0 {
		t.Fatalf("appleton.com flagged: %+v", items)
	}
	if items := hostFindings(base("paypal.com", "paypal.com", "paypal.com")); len(items) != 0 {
		t.Fatalf("paypal.com flagged: %+v", items)
	}
	sbi := hostFindings(base("sbi.example.com", "sbi.example.com", "example.com"))
	if len(sbi) == 0 || sbi[0].ID != "brand_lookalike" {
		t.Fatalf("sbi.example.com: %+v", sbi)
	}
	hdfc := hostFindings(base("hdfc-secure.example.com", "hdfc-secure.example.com", "example.com"))
	if len(hdfc) == 0 || hdfc[0].ID != "brand_lookalike" {
		t.Fatalf("hdfc-secure.example.com: %+v", hdfc)
	}
	if items := hostFindings(base("hdfcbank.com", "hdfcbank.com", "hdfcbank.com")); len(items) != 0 {
		t.Fatalf("hdfcbank.com flagged: %+v", items)
	}
	paypa1 := hostFindings(base("paypa1.com", "paypa1.com", "paypa1.com"))
	if len(paypa1) != 1 || paypa1[0].ID != "brand_lookalike" {
		t.Fatalf("paypa1: %+v", paypa1)
	}
	// Cyrillic a, then "pple.com".
	look := "\u0430pple.com"
	got := hostFindings(base("xn--pple-43d.com", look, "xn--pple-43d.com"))
	if len(got) == 0 || got[0].ID != "confusable_script" {
		t.Fatalf("confusable: %+v", got)
	}
}

func TestExtraSignalsStayOutsideRules(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	old := now.AddDate(-5, 0, 0).Format(time.RFC3339)
	got := Score(Facts{
		Now: now, Scheme: "https", Hostname: "kyc-otp.tk", UnicodeHost: "kyc-otp.tk", Registrable: "kyc-otp.tk",
		Certificate:  &model.Certificate{Checked: true, Valid: true, DaysLeft: 40, Protocol: "TLS 1.3"},
		Registration: &model.Registration{Found: true, Registered: old},
	})
	if got.Rule != 0 {
		t.Fatalf("extra signals leaked into rules: %d", got.Rule)
	}
	ids := map[string]bool{}
	for _, item := range got.Findings {
		ids[item.ID] = true
	}
	if !ids["host_bait"] || !ids["cheap_tld"] {
		t.Fatalf("missing extras: %+v", ids)
	}
}

func TestBlockedRedirectIsNotARule(t *testing.T) {
	got := Score(Facts{
		Scheme: "https", Hostname: "example.com", UnicodeHost: "example.com", Registrable: "example.com",
		Certificate: &model.Certificate{Checked: true, Valid: true, DaysLeft: 10, Protocol: "TLS 1.3"},
		Page:        &model.Page{BlockedRedirect: "127.0.0.1"},
	})
	if got.Rule != 0 {
		t.Fatal(got.Rule)
	}
	if got.Advisory != wBlocked {
		t.Fatalf("advisory %d", got.Advisory)
	}
}
