package score

import (
	"testing"
	"time"

	"websentinel/core/internal/model"
)

// ── Band / verdict tests ──────────────────────────────────────────────

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

func TestDetermineVerdict(t *testing.T) {
	tests := []struct {
		score   int
		wantV   string
		wantLbl string
	}{
		{0, "safe", "Safe"},
		{23, "safe", "Safe"},
		{24, "suspicious", "Suspicious"},
		{58, "suspicious", "Suspicious"},
		{59, "high_risk", "High risk"},
		{100, "high_risk", "High risk"},
	}
	for _, tc := range tests {
		v, lbl := DetermineVerdict(tc.score)
		if v != tc.wantV || lbl != tc.wantLbl {
			t.Errorf("DetermineVerdict(%d) = (%q, %q), want (%q, %q)", tc.score, v, lbl, tc.wantV, tc.wantLbl)
		}
	}
}

func TestVerdictConstants(t *testing.T) {
	if VerdictHighRiskMin != 59 {
		t.Errorf("VerdictHighRiskMin = %d, want 59", VerdictHighRiskMin)
	}
	if VerdictSuspiciousMin != 24 {
		t.Errorf("VerdictSuspiciousMin = %d, want 24", VerdictSuspiciousMin)
	}
	if VerdictSafeMax != 23 {
		t.Errorf("VerdictSafeMax = %d, want 23", VerdictSafeMax)
	}
}

// ── Paper rules tests ─────────────────────────────────────────────────

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

// ── Extended signals must stay out of the rule score ──────────────────

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

// ── Look-alike and host tests ─────────────────────────────────────────

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

// ── New public API tests ──────────────────────────────────────────────

func TestCalculateRuleTotal(t *testing.T) {
	tests := []struct {
		name    string
		find    []model.Finding
		want    int
	}{
		{
			name: "empty slice",
			find: nil,
			want: 0,
		},
		{
			name: "only rule findings count",
			find: []model.Finding{
				{ID: "scheme_http", Rule: true, Weight: 20},
				{ID: "cert_invalid", Rule: true, Weight: 20},
				{ID: "host_bait", Rule: false, Weight: 12},
			},
			want: 40,
		},
		{
			name: "negative weights can bring total below zero, clamped to zero",
			find: []model.Finding{
				{ID: "dnssec", Rule: true, Weight: -3},
			},
			want: 0,
		},
		{
			name: "mixed rule and non-rule",
			find: []model.Finding{
				{ID: "scheme_http", Rule: true, Weight: 20},
				{ID: "domain_age", Rule: true, Weight: 35},
				{ID: "dnssec", Rule: true, Weight: -3},
				{ID: "brand_lookalike", Rule: false, Weight: 28},
				{ID: "cheap_tld", Rule: false, Weight: 10},
			},
			want: 52, // 20+35-3 = 52
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateRuleTotal(tc.find)
			if got != tc.want {
				t.Errorf("CalculateRuleTotal = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestCalculateAdvisory(t *testing.T) {
	tests := []struct {
		name    string
		rule    int
		find    []model.Finding
		want    int
	}{
		{
			name: "only rule, no extras",
			rule: 40,
			find: nil,
			want: 40,
		},
		{
			name: "rule plus extras, under cap",
			rule: 20,
			find: []model.Finding{
				{ID: "brand_lookalike", Rule: false, Weight: 28},
				{ID: "host_bait", Rule: false, Weight: 12},
			},
			want: 60,
		},
		{
			name: "capped at 100",
			rule: 85,
			find: []model.Finding{
				{ID: "brand_lookalike", Rule: false, Weight: 28},
			},
			want: 100,
		},
		{
			name: "negative advisory clamped to zero",
			rule: 0,
			find: []model.Finding{
				{ID: "negative_test", Rule: false, Weight: -10},
			},
			want: 0,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateAdvisory(tc.rule, tc.find)
			if got != tc.want {
				t.Errorf("CalculateAdvisory(%d, _) = %d, want %d", tc.rule, got, tc.want)
			}
		})
	}
}

func TestDocumentedRuleWeights(t *testing.T) {
	if DocumentedRuleWeights["scheme_http"] != wScheme {
		t.Errorf("scheme_http = %d", DocumentedRuleWeights["scheme_http"])
	}
	if DocumentedRuleWeights["cert_missing"] != wCert {
		t.Errorf("cert_missing = %d", DocumentedRuleWeights["cert_missing"])
	}
	if DocumentedRuleWeights["cert_invalid"] != wCert {
		t.Errorf("cert_invalid = %d", DocumentedRuleWeights["cert_invalid"])
	}
	if DocumentedRuleWeights["cert_expiry"] != wExpiry {
		t.Errorf("cert_expiry = %d", DocumentedRuleWeights["cert_expiry"])
	}
	if DocumentedRuleWeights["dnssec"] != -wDNSSEC {
		t.Errorf("dnssec = %d, want %d", DocumentedRuleWeights["dnssec"], -wDNSSEC)
	}
}

// ── Integration-style: Score() produces correct Calculate* round-trip ──

func TestScoreRoundTripWithPublicAPI(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	r := Score(Facts{
		Now: now, Scheme: "http", Hostname: "new-phish.example",
		Certificate:  &model.Certificate{Checked: true, Valid: false, Error: "expired"},
		Registration: &model.Registration{Found: true, Registered: now.AddDate(0, 0, -2).Format(time.RFC3339), DNSSECKnown: true},
	})

	ruleBack := CalculateRuleTotal(r.Findings)
	if ruleBack != r.Rule {
		t.Errorf("CalculateRuleTotal(%d) ≠ Score.Rule(%d)", ruleBack, r.Rule)
	}

	advBack := CalculateAdvisory(r.Rule, r.Findings)
	if advBack != r.Advisory {
		t.Errorf("CalculateAdvisory(%d) ≠ Score.Advisory(%d)", advBack, r.Advisory)
	}

	v, lbl := DetermineVerdict(r.Advisory)
	if v != r.Verdict || lbl != r.Label {
		t.Errorf("DetermineVerdict mismatch: (%q,%q) vs (%q,%q)", v, lbl, r.Verdict, r.Label)
	}
}

// ── Helper tests ──────────────────────────────────────────────────────

func TestDaysBetween(t *testing.T) {
	base := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	if d := daysBetween(base, base); d != 0 {
		t.Fatalf("same day: %d", d)
	}
	if d := daysBetween(base.AddDate(0, 0, 1), base); d != -1 {
		t.Fatalf("future: %d", d)
	}
	if d := daysBetween(base.AddDate(0, 0, -1), base); d != 1 {
		t.Fatalf("1 day ago: %d", d)
	}
	if d := daysBetween(base.AddDate(0, 0, -365), base); d != 365 {
		t.Fatalf("1 year: %d", d)
	}
}

func TestIsIP(t *testing.T) {
	if !isIP("8.8.8.8") {
		t.Fatal("8.8.8.8")
	}
	if !isIP("::1") {
		t.Fatal("::1")
	}
	if isIP("example.com") {
		t.Fatal("example.com")
	}
}

func TestSeverityFor(t *testing.T) {
	if s := severityFor(20); s != "risk" {
		t.Fatalf("20 -> %s", s)
	}
	if s := severityFor(1); s != "caution" {
		t.Fatalf("1 -> %s", s)
	}
	if s := severityFor(0); s != "info" {
		t.Fatalf("0 -> %s", s)
	}
	if s := severityFor(-3); s != "info" {
		t.Fatalf("-3 -> %s", s)
	}
}

func TestOrder(t *testing.T) {
	f := []model.Finding{
		{ID: "a", Weight: 10},
		{ID: "b", Weight: 30},
		{ID: "c", Weight: 20},
		{ID: "d", Weight: 30},
	}
	got := order(f)
	if got[0].ID != "b" && got[0].ID != "d" {
		t.Fatalf("first %s, want b or d", got[0].ID)
	}
	if got[0].Weight != 30 {
		t.Fatalf("first weight %d", got[0].Weight)
	}
}