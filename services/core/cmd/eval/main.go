package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"websentinel/core/internal/model"
	"websentinel/core/internal/score"
)

type fixture struct {
	Name              string `json:"name"`
	Scheme            string `json:"scheme"`
	Hostname          string `json:"hostname"`
	UnicodeHost       string `json:"unicodeHost"`
	Registrable       string `json:"registrable"`
	CertChecked       bool   `json:"certChecked"`
	CertValid         bool   `json:"certValid"`
	DaysLeft          int    `json:"daysLeft"`
	RegisteredDaysAgo int    `json:"registeredDaysAgo"`
	UpdatedDaysAgo    int    `json:"updatedDaysAgo"`
	DNSSEC            bool   `json:"dnssec"`
	WantRule          int    `json:"wantRule"`
	WantVerdict       string `json:"wantVerdict"`
}

func main() {
	path := flag.String("fixtures", "../../data/eval-fixtures.json", "fixture file")
	flag.Parse()
	raw, err := os.ReadFile(*path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read: %v\n", err)
		os.Exit(2)
	}
	var cases []fixture
	if err := json.Unmarshal(raw, &cases); err != nil {
		fmt.Fprintf(os.Stderr, "json: %v\n", err)
		os.Exit(2)
	}
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	fail := 0
	for _, tc := range cases {
		reg := &model.Registration{Found: true, DNSSECKnown: true, DNSSEC: tc.DNSSEC}
		if tc.RegisteredDaysAgo >= 0 {
			reg.Registered = now.AddDate(0, 0, -tc.RegisteredDaysAgo).Format(time.RFC3339)
		}
		if tc.UpdatedDaysAgo > 0 {
			reg.Updated = now.AddDate(0, 0, -tc.UpdatedDaysAgo).Format(time.RFC3339)
		}
		got := score.Score(score.Facts{
			Now:          now,
			Scheme:       tc.Scheme,
			Hostname:     tc.Hostname,
			UnicodeHost:  first(tc.UnicodeHost, tc.Hostname),
			Registrable:  first(tc.Registrable, tc.Hostname),
			Certificate:  &model.Certificate{Checked: tc.CertChecked, Valid: tc.CertValid, DaysLeft: tc.DaysLeft, Protocol: "TLS 1.3"},
			Registration: reg,
		})
		ok := got.Rule == tc.WantRule && got.Verdict == tc.WantVerdict
		mark := "ok"
		if !ok {
			mark = "FAIL"
			fail++
		}
		fmt.Printf("%s  %s  rule=%d want=%d  verdict=%s want=%s\n", mark, tc.Name, got.Rule, tc.WantRule, got.Verdict, tc.WantVerdict)
	}
	if fail > 0 {
		os.Exit(1)
	}
}

func first(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
