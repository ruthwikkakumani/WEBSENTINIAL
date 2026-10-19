// Package model is the assessment contract shared by collectors, the rule
// engine, and the HTTP API. Collectors fill facts. The score package is the
// only place that turns facts into points.
package model

import "time"

// Finding is one explainable observation. Weight is the advisory contribution.
// Rule is true when the weight belongs to the documented prototype rules.
type Finding struct {
	ID       string `json:"id"`
	Signal   string `json:"signal"`
	Severity string `json:"severity"`
	Weight   int    `json:"weight"`
	Rule     bool   `json:"rule"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Evidence string `json:"evidence,omitempty"`
}

// Hop is one HTTP redirect, stored without path or query.
type Hop struct {
	Origin string `json:"origin"`
	Status int    `json:"status"`
}

// Certificate is what a TLS handshake on port 443 revealed.
type Certificate struct {
	Checked    bool     `json:"checked"`
	Valid      bool     `json:"valid"`
	Error      string   `json:"error,omitempty"`
	Protocol   string   `json:"protocol,omitempty"`
	Cipher     string   `json:"cipher,omitempty"`
	Issuer     string   `json:"issuer,omitempty"`
	Subject    string   `json:"subject,omitempty"`
	NotBefore  string   `json:"notBefore,omitempty"`
	NotAfter   string   `json:"notAfter,omitempty"`
	DaysLeft   int      `json:"daysLeft"`
	Names      []string `json:"names,omitempty"`
	NameCount  int      `json:"nameCount"`
	SelfSigned bool     `json:"selfSigned"`
}

// DNS is the public record set. Addresses are included only after they passed
// the public-address check.
type DNS struct {
	Addresses   []string `json:"addresses,omitempty"`
	Nameservers []string `json:"nameservers,omitempty"`
	MailServers []string `json:"mailServers,omitempty"`
	Text        []string `json:"text,omitempty"`
	Pointers    []string `json:"pointers,omitempty"`
	HasSPF      bool     `json:"hasSpf,omitempty"`
	HasDMARC    bool     `json:"hasDmarc,omitempty"`
	Error       string   `json:"error,omitempty"`
}

// Registration is a registry record from the RDAP service.
type Registration struct {
	Found       bool     `json:"found"`
	Source      string   `json:"source,omitempty"`
	Registrar   string   `json:"registrar,omitempty"`
	Statuses    []string `json:"statuses,omitempty"`
	Nameservers []string `json:"nameservers,omitempty"`
	Registered  string   `json:"registered,omitempty"`
	Updated     string   `json:"updated,omitempty"`
	Expires     string   `json:"expires,omitempty"`
	Age         string   `json:"age,omitempty"`
	DNSSEC      bool     `json:"dnssec"`
	DNSSECKnown bool     `json:"dnssecKnown"`
	Error       string   `json:"error,omitempty"`
}

// Page is an unauthenticated header-and-title read. Paths are not stored.
type Page struct {
	FinalOrigin     string            `json:"finalOrigin,omitempty"`
	Hops            []Hop             `json:"hops"`
	CrossSite       bool              `json:"crossSite"`
	Title           string            `json:"title,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	Error           string            `json:"error,omitempty"`
	BlockedRedirect string            `json:"blockedRedirect,omitempty"`
}

// Assessment is one finished case file.
type Assessment struct {
	ID            string        `json:"id"`
	AssessedAt    time.Time     `json:"assessedAt"`
	Origin        string        `json:"origin"`
	Scheme        string        `json:"scheme"`
	Hostname      string        `json:"hostname"`
	Registrable   string        `json:"registrableDomain"`
	DiscardedPath bool          `json:"discardedPath"`
	ConnectedTo   string        `json:"connectedTo,omitempty"`
	RuleScore     int           `json:"ruleScore"`
	AdvisoryScore int           `json:"advisoryScore"`
	Verdict       string        `json:"verdict"`
	VerdictLabel  string        `json:"verdictLabel"`
	Summary       string        `json:"summary"`
	Disclaimer    string        `json:"disclaimer"`
	Findings      []Finding     `json:"findings"`
	Checked       []string      `json:"checked"`
	NotChecked    []string      `json:"notChecked"`
	Limitations   []string      `json:"limitations"`
	Certificate   *Certificate  `json:"certificate,omitempty"`
	DNS           *DNS          `json:"dns,omitempty"`
	Registration  *Registration `json:"registration,omitempty"`
	Page          *Page         `json:"page,omitempty"`
}

// Disclaimer is shown on every assessment.
const Disclaimer = "WebSentinel is an advisory assistant. A low score is not proof of safety. A high score is a request for caution."
