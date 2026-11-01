// Package score turns collected facts into the documented rule score and a
// separate, uncalibrated advisory. Paper weights and extra observations are
// never mixed into the same number without being marked.
package score

import (
	"fmt"
	"net"
	"strings"
	"time"

	"websentinel/core/internal/model"
)

const (
	wScheme = 20
	wCert   = 20
	wExpiry = 3
	wAge7   = 35
	wAge30  = 25
	wAge182 = 15
	wAge365 = 8
	wUpd7   = 10
	wUpd30  = 6
	wDNSSEC = 3

	wBrand   = 28
	wLook    = 26
	wPuny    = 8
	wIP      = 18
	wCross   = 16
	wHold    = 20
	wFresh   = 8
	wDeep    = 6
	wOldTLS  = 6
	wBlocked = 30
)

// Result is the policy output for one set of facts.
type Result struct {
	Rule     int
	Advisory int
	Verdict  string
	Label    string
	Summary  string
	Findings []model.Finding
}

// Facts is everything the policy is allowed to see.
type Facts struct {
	Now          time.Time
	Scheme       string
	Hostname     string
	UnicodeHost  string
	Registrable  string
	Certificate  *model.Certificate
	DNS          *model.DNS
	Registration *model.Registration
	Page         *model.Page
}

// Score applies the documented rules, then the extra observations.
func Score(f Facts) Result {
	if f.Now.IsZero() {
		f.Now = time.Now().UTC()
	}
	var findings []model.Finding
	rule := 0

	if f.Scheme != "https" {
		rule += wScheme
		findings = append(findings, model.Finding{
			ID: "scheme_http", Signal: "Protocol", Severity: "risk", Weight: wScheme, Rule: true,
			Title:    "The link is not HTTPS",
			Detail:   "Anything typed on an HTTP page can be read or changed on the network. A later redirect to HTTPS does not change the fact that this address started without encryption.",
			Evidence: "scheme=" + f.Scheme,
		})
	}

	findings, rule = appendCert(findings, rule, f)
	findings, rule = appendAge(findings, rule, f)
	findings = append(findings, hostFindings(f)...)
	findings = append(findings, extraHost(f)...)
	findings = append(findings, pageFindings(f)...)
	findings = append(findings, extraPage(f)...)
	findings = append(findings, extraDNS(f)...)

	if rule < 0 {
		rule = 0
	}
	advisory := rule
	for _, item := range findings {
		if !item.Rule {
			advisory += item.Weight
		}
	}
	if advisory < 0 {
		advisory = 0
	}
	if advisory > 100 {
		advisory = 100
	}
	verdict, label := Band(advisory)
	ordered := order(findings)
	return Result{
		Rule: rule, Advisory: advisory, Verdict: verdict, Label: label,
		Summary: summary(verdict, ordered), Findings: ordered,
	}
}

// Band maps a score onto the prototype verdicts.
// Safe below 24, Suspicious from 24 up to but not including 59, High risk at 59.
func Band(n int) (string, string) {
	switch {
	case n >= 59:
		return "high_risk", "High risk"
	case n >= 24:
		return "suspicious", "Suspicious"
	default:
		return "safe", "Safe"
	}
}

// VerdictThresholds documents the band boundaries as human-readable constants.
// HighRiskMin is the minimum advisory score that triggers a high_risk verdict.
// SuspiciousMin is the minimum advisory score that triggers a suspicious verdict.
// SafeMax is the maximum advisory score that remains in the safe band.
const (
	VerdictHighRiskMin  = 59
	VerdictSuspiciousMin = 24
	VerdictSafeMax       = 23
)

// DocumentedRuleWeights indexes every constant used by the documented prototype
// rules (rule=true findings). The map key is the finding ID and the value is
// the point contribution.
var DocumentedRuleWeights = map[string]int{
	"scheme_http":    wScheme,
	"cert_missing":   wCert,
	"cert_invalid":   wCert,
	"cert_expiry":    wExpiry,
	"domain_age":     35, // worst case; actual value depends on ageWeight()
	"record_updated": 10, // worst case; actual value depends on updateWeight()
	"dnssec":         -wDNSSEC,
}

// CalculateRuleTotal derives the rule score from a slice of findings. Only
// findings with Rule set to true contribute. The sum is floored at 0.
func CalculateRuleTotal(findings []model.Finding) int {
	total := 0
	for _, f := range findings {
		if f.Rule {
			total += f.Weight
		}
	}
	if total < 0 {
		return 0
	}
	return total
}

// CalculateAdvisory sums both rule and non-rule weights, clamped to [0, 100].
// This matches the advisory computation inside Score.
func CalculateAdvisory(rule int, findings []model.Finding) int {
	advisory := rule
	for _, f := range findings {
		if !f.Rule {
			advisory += f.Weight
		}
	}
	if advisory < 0 {
		advisory = 0
	}
	if advisory > 100 {
		advisory = 100
	}
	return advisory
}

// DetermineVerdict returns the verdict string and display label for an advisory
// score. It delegates to Band.
func DetermineVerdict(advisory int) (verdict, label string) {
	return Band(advisory)
}

func appendCert(findings []model.Finding, rule int, f Facts) ([]model.Finding, int) {
	c := f.Certificate
	if c != nil && c.Error == "not contacted" {
		return append(findings, model.Finding{
			ID: "not_resolved", Signal: "DNS", Severity: "caution", Weight: 24, Rule: false,
			Title:  "This name did not resolve",
			Detail: "There was no public address to contact, so the certificate and the page were not read. A link that does not resolve is not a place to enter information.",
		}), rule
	}
	if c != nil && c.Error == "non-public" {
		return append(findings, model.Finding{
			ID: "address_moved", Signal: "DNS", Severity: "risk", Weight: 30, Rule: false,
			Title:  "The name pointed at a non-public address",
			Detail: "During the check the name resolved to a local, private, or metadata address. The connection was refused.",
		}), rule
	}
	if c == nil || !c.Checked {
		rule += wCert
		detail := "The site did not complete a TLS handshake on port 443, so its identity was not confirmed."
		ev := ""
		if c != nil && c.Error != "" {
			ev = c.Error
		}
		return append(findings, model.Finding{
			ID: "cert_missing", Signal: "Certificate", Severity: "risk", Weight: wCert, Rule: true,
			Title: "No certificate could be checked", Detail: detail, Evidence: ev,
		}), rule
	}
	if !c.Valid {
		rule += wCert
		return append(findings, model.Finding{
			ID: "cert_invalid", Signal: "Certificate", Severity: "risk", Weight: wCert, Rule: true,
			Title:    "The certificate did not verify",
			Detail:   "A browser would not trust this certificate. " + plainCert(c.Error) + " A padlock is not available, and a padlock would not have proved who runs the site anyway.",
			Evidence: c.Error,
		}), rule
	}

	findings = append(findings, model.Finding{
		ID: "cert_valid", Signal: "Certificate", Severity: "info", Weight: 0, Rule: false,
		Title:    "The certificate verifies",
		Detail:   "A trusted authority issued a certificate for this hostname, and it is inside its dates. That means the connection can be private. It does not mean the operator is who you think they are.",
		Evidence: c.Issuer,
	})
	if c.DaysLeft >= 0 && c.DaysLeft < 7 {
		rule += wExpiry
		findings = append(findings, model.Finding{
			ID: "cert_expiry", Signal: "Certificate", Severity: "caution", Weight: wExpiry, Rule: true,
			Title:    "The certificate expires within a week",
			Detail:   fmt.Sprintf("It has %d day(s) left. The documented rules add a small penalty. Renewal in the next week is not, by itself, a phishing signal.", c.DaysLeft),
			Evidence: c.NotAfter,
		})
	}
	if c.Protocol == "TLS 1.0" || c.Protocol == "TLS 1.1" {
		findings = append(findings, model.Finding{
			ID: "tls_old", Signal: "Certificate", Severity: "caution", Weight: wOldTLS, Rule: false,
			Title:    "The site still offers an old TLS version",
			Detail:   c.Protocol + " is obsolete. This is a hygiene note, not a phishing verdict.",
			Evidence: c.Protocol,
		})
	}
	if fresh, ok := recentlyIssued(c.NotBefore, f.Now); ok && fresh && youngEnough(f) {
		findings = append(findings, model.Finding{
			ID: "cert_fresh", Signal: "Certificate", Severity: "caution", Weight: wFresh, Rule: false,
			Title:    "The certificate was issued in the last two weeks",
			Detail:   "New certificates are normal when a site is launched. Combined with a young domain, they are also common on short-lived phishing hosts. This observation is outside the documented rule set.",
			Evidence: c.NotBefore,
		})
	}
	return findings, rule
}

func appendAge(findings []model.Finding, rule int, f Facts) ([]model.Finding, int) {
	reg := f.Registration
	if reg == nil || !reg.Found || reg.Registered == "" {
		msg := "No registry record was available, so domain age was not scored. A missing record is not treated as proof of risk."
		ev := ""
		if reg != nil && reg.Error != "" {
			ev = reg.Error
		}
		if isIP(f.Hostname) {
			msg = "An IP address has no domain registration record, so age was not scored."
		}
		findings = append(findings, model.Finding{
			ID: "age_unknown", Signal: "Registration", Severity: "info", Weight: 0,
			Title: "Registration age is unknown", Detail: msg, Evidence: ev,
		})
		return findings, rule
	}
	registered, err := time.Parse(time.RFC3339, reg.Registered)
	if err != nil {
		findings = append(findings, model.Finding{
			ID: "age_unknown", Signal: "Registration", Severity: "info", Weight: 0,
			Title:  "Registration age is unknown",
			Detail: "The registry date could not be read, so age was not scored.",
		})
		return findings, rule
	}
	days := daysBetween(registered, f.Now)
	w := ageWeight(days)
	registeredName := f.Registrable
	if registeredName == "" {
		registeredName = f.Hostname
	}
	if w == 0 {
		findings = append(findings, model.Finding{
			ID: "age_established", Signal: "Registration", Severity: "info", Weight: 0,
			Title:    "The registered domain is more than a year old",
			Detail:   fmt.Sprintf("%s was registered %s ago. Newness is not a concern on this signal. Older domains are still used for phishing, and a subdomain does not inherit trust from the name on the right.", registeredName, humanAge(days)),
			Evidence: reg.Registered,
		})
	} else {
		rule += w
		findings = append(findings, model.Finding{
			ID: "domain_age", Signal: "Registration", Severity: severityFor(w), Weight: w, Rule: true,
			Title:    ageTitle(days),
			Detail:   fmt.Sprintf("%s was registered %s ago. Short-lived phishing sites are often newly registered. Age is a warning, not proof of intent.", registeredName, humanAge(days)),
			Evidence: reg.Registered,
		})
	}
	if reg.Updated != "" {
		if updated, err := time.Parse(time.RFC3339, reg.Updated); err == nil {
			ud := daysBetween(updated, f.Now)
			uw := updateWeight(ud)
			if uw > 0 {
				rule += uw
				findings = append(findings, model.Finding{
					ID: "record_updated", Signal: "Registration", Severity: "caution", Weight: uw, Rule: true,
					Title:    "The registry record changed recently",
					Detail:   fmt.Sprintf("It was updated %s ago. Legitimate sites change records too. The documented rules still add %d points.", humanAge(ud), uw),
					Evidence: reg.Updated,
				})
			}
		}
	}
	for _, status := range reg.Statuses {
		if holdStatus(status) {
			findings = append(findings, model.Finding{
				ID: "registry_hold", Signal: "Registration", Severity: "risk", Weight: wHold, Rule: false,
				Title:    "The registry lists a hold or deletion status",
				Detail:   "Status \"" + status + "\" means the name is not in ordinary good standing. This is outside the documented rule set.",
				Evidence: status,
			})
			break
		}
	}
	if reg.DNSSECKnown && reg.DNSSEC && f.Scheme == "https" {
		rule -= wDNSSEC
		findings = append(findings, model.Finding{
			ID: "dnssec", Signal: "Registration", Severity: "info", Weight: -wDNSSEC, Rule: true,
			Title:    "DNSSEC is signed",
			Detail:   "The registry marks this delegation as signed. The documented rules subtract 3 points. DNSSEC does not prove the website is legitimate.",
			Evidence: reg.Source,
		})
	} else if reg.DNSSECKnown && !reg.DNSSEC {
		findings = append(findings, model.Finding{
			ID: "dnssec_absent", Signal: "Registration", Severity: "info", Weight: 0,
			Title:  "DNSSEC is not signed",
			Detail: "Most websites are not DNSSEC-signed, so this is recorded and not scored.",
		})
	}
	return findings, rule
}

func pageFindings(f Facts) []model.Finding {
	p := f.Page
	if p == nil {
		return nil
	}
	var out []model.Finding
	if p.BlockedRedirect != "" {
		out = append(out, model.Finding{
			ID: "redirect_blocked", Signal: "Redirects", Severity: "risk", Weight: wBlocked, Rule: false,
			Title:    "A redirect pointed at a non-public address",
			Detail:   "The hop was not followed. Do not continue to a page that sends people toward a local or metadata address.",
			Evidence: p.BlockedRedirect,
		})
	}
	if p.CrossSite {
		out = append(out, model.Finding{
			ID: "redirect_cross_site", Signal: "Redirects", Severity: "caution", Weight: wCross, Rule: false,
			Title:    "The link leaves its registered domain",
			Detail:   "The final host is registered separately from the address you submitted. Cross-site hops are how open redirects hide a destination. This is outside the documented rule set.",
			Evidence: p.FinalOrigin,
		})
	}
	return out
}

func ageWeight(days int) int {
	switch {
	case days < 0:
		return 0
	case days < 7:
		return wAge7
	case days < 30:
		return wAge30
	case days < 182:
		return wAge182
	case days < 365:
		return wAge365
	default:
		return 0
	}
}

func updateWeight(days int) int {
	switch {
	case days < 0:
		return 0
	case days < 7:
		return wUpd7
	case days < 30:
		return wUpd30
	default:
		return 0
	}
}

func ageTitle(days int) string {
	switch {
	case days < 7:
		return "This domain is only a few days old"
	case days < 30:
		return "This domain is less than a month old"
	case days < 182:
		return "This domain is less than six months old"
	default:
		return "This domain is less than a year old"
	}
}

func daysBetween(from, now time.Time) int {
	if from.After(now) {
		return -1
	}
	return int(now.Sub(from).Hours() / 24)
}

func humanAge(days int) string {
	switch {
	case days < 0:
		return "an unreadable time"
	case days < 1:
		return "less than a day"
	case days == 1:
		return "1 day"
	case days < 60:
		return fmt.Sprintf("%d days", days)
	case days < 730:
		return fmt.Sprintf("%d months", days/30)
	default:
		return fmt.Sprintf("%d years", days/365)
	}
}

func youngEnough(f Facts) bool {
	reg := f.Registration
	if reg == nil || reg.Registered == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, reg.Registered)
	if err != nil {
		return false
	}
	d := daysBetween(t, f.Now)
	return d >= 0 && d < 365
}

func recentlyIssued(raw string, now time.Time) (bool, bool) {
	if raw == "" {
		return false, false
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return false, false
	}
	d := daysBetween(t, now)
	return d >= 0 && d < 14, true
}

func holdStatus(status string) bool {
	s := strings.ToLower(status)
	switch s {
	case "client hold", "server hold", "pending delete", "redemption period", "inactive":
		return true
	default:
		return false
	}
}

func plainCert(err string) string {
	e := strings.ToLower(err)
	switch {
	case strings.Contains(e, "expired"):
		return "It is expired."
	case strings.Contains(e, "not yet valid"):
		return "It is not valid yet."
	case strings.Contains(e, "hostname"), strings.Contains(e, "doesn't contain"), strings.Contains(e, "does not match"):
		return "It was not issued for this hostname."
	case strings.Contains(e, "unknown authority"), strings.Contains(e, "self-signed"), strings.Contains(e, "self signed"):
		return "It was not issued by a trusted certificate authority."
	default:
		return "It failed verification."
	}
}

func severityFor(weight int) string {
	if weight >= 20 {
		return "risk"
	}
	if weight > 0 {
		return "caution"
	}
	return "info"
}

func isIP(host string) bool {
	return net.ParseIP(host) != nil
}

func summary(verdict string, findings []model.Finding) string {
	switch verdict {
	case "high_risk":
		return "Several public warning signs are concentrated on this address. Do not enter credentials or payment details on the strength of this page, and confirm the destination by a channel you already trust."
	case "suspicious":
		return "Some public signals deserve a second look before you enter any information. Read the reasons below and decide with them, not with the number alone."
	default:
		for _, item := range findings {
			if item.Severity == "risk" && item.Weight > 0 {
				return "The total stays under the caution line, but a serious signal still fired. Read it before you treat the word Safe as reassuring."
			}
		}
		return "The documented rules did not cross the caution line. That is not a guarantee the site is legitimate, and a valid certificate does not prove identity."
	}
}

func order(in []model.Finding) []model.Finding {
	out := make([]model.Finding, 0, len(in))
	out = append(out, in...)
	// Heaviest reasons first. Equal weights keep their original order.
	for i := 1; i < len(out); i++ {
		j := i
		for j > 0 && out[j].Weight > out[j-1].Weight {
			out[j], out[j-1] = out[j-1], out[j]
			j--
		}
	}
	return out
}
