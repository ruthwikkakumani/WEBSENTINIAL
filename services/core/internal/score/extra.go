package score

import (
	"fmt"
	"strings"
	"unicode"

	"websentinel/core/internal/model"
)

const (
	wBait      = 12
	wCheap     = 10
	wHyphen    = 6
	wTitleBait = 10
	wHidden    = 22
)

var bait = []string{
	"kyc", "aadhaar", "aadhar", "refund", "invoice", "lottery", "giveaway",
	"unlock", "otp", "prize",
}

var cheapTLD = map[string]bool{
	"tk": true, "ml": true, "ga": true, "cf": true, "gq": true,
	"zip": true, "mov": true,
}

func extraHost(f Facts) []model.Finding {
	host := strings.ToLower(f.UnicodeHost)
	if host == "" {
		host = strings.ToLower(f.Hostname)
	}
	if host == "" {
		return nil
	}
	var out []model.Finding
	if hiddenRunes(host) {
		out = append(out, model.Finding{
			ID: "hidden_chars", Signal: "Hostname", Severity: "risk", Weight: wHidden, Rule: false,
			Title:  "The hostname hides characters you cannot see",
			Detail: "Zero-width or bidirectional marks can make two names look identical. Do not type anything here.",
		})
	}
	if word, ok := baitWord(host); ok {
		out = append(out, model.Finding{
			ID: "host_bait", Signal: "Hostname", Severity: "caution", Weight: wBait, Rule: false,
			Title:    "The hostname uses a password-reset or KYC word",
			Detail:   fmt.Sprintf("“%s” is a word phishing pages put in a host to look like an official message. This is outside the documented rules.", word),
			Evidence: word,
		})
	}
	if tld := lastLabel(host); cheapTLD[tld] {
		out = append(out, model.Finding{
			ID: "cheap_tld", Signal: "Hostname", Severity: "caution", Weight: wCheap, Rule: false,
			Title:    "This name uses a TLD that is often rented for a few hours",
			Detail:   tld + " is still a real TLD. It is also cheap and fast to get, which is why it shows up in short-lived phishing. This observation is not a documented rule.",
			Evidence: tld,
		})
	}
	if hyphenCount(host) >= 3 {
		out = append(out, model.Finding{
			ID: "hyphen_stuffing", Signal: "Hostname", Severity: "caution", Weight: wHyphen, Rule: false,
			Title:  "The hostname is stuffed with hyphens",
			Detail: "Several hyphens are a way to pack brand words and bait words into one label. Ordinary company names rarely need that many.",
		})
	}
	return out
}

func extraDNS(f Facts) []model.Finding {
	d := f.DNS
	if d == nil {
		return nil
	}
	var out []model.Finding
	if d.HasSPF {
		out = append(out, model.Finding{
			ID: "spf_present", Signal: "DNS", Severity: "info", Weight: 0, Rule: false,
			Title:  "SPF is published",
			Detail: "A sender policy exists for this name. That is mail hygiene, not proof the website is legitimate.",
		})
	} else if len(d.Addresses) > 0 {
		out = append(out, model.Finding{
			ID: "spf_absent", Signal: "DNS", Severity: "info", Weight: 0, Rule: false,
			Title:  "No SPF record was published on this host",
			Detail: "Most websites have none. This is recorded and not scored.",
		})
	}
	if d.HasDMARC {
		out = append(out, model.Finding{
			ID: "dmarc_present", Signal: "DNS", Severity: "info", Weight: 0, Rule: false,
			Title:  "DMARC is published",
			Detail: "The registered domain publishes a DMARC policy. That is mail hygiene, not proof the website is legitimate.",
		})
	}
	return out
}

func extraPage(f Facts) []model.Finding {
	p := f.Page
	if p == nil {
		return nil
	}
	var out []model.Finding
	if word, ok := titleBait(p.Title); ok {
		out = append(out, model.Finding{
			ID: "title_bait", Signal: "Page", Severity: "caution", Weight: wTitleBait, Rule: false,
			Title:    "The page title talks like a bank message",
			Detail:   "Titles that mention an OTP, KYC, or a locked account are a common lure. The title is easy to fake. This is outside the documented rules.",
			Evidence: word,
		})
	}
	if p.Error == "" && p.BlockedRedirect == "" && f.Scheme == "https" && (p.Headers == nil || p.Headers["Strict-Transport-Security"] == "") {
		out = append(out, model.Finding{
			ID: "hsts_absent", Signal: "Page", Severity: "info", Weight: 0, Rule: false,
			Title:  "No HSTS header was observed",
			Detail: "The site did not ask the browser to stay on HTTPS. Many legitimate sites omit it. It is recorded and not scored.",
		})
	}
	return out
}

func baitWord(host string) (string, bool) {
	for _, word := range bait {
		if labelHas(host, word) {
			return word, true
		}
	}
	return "", false
}

func labelHas(host, word string) bool {
	for _, label := range strings.Split(host, ".") {
		if label == word {
			return true
		}
		for _, part := range strings.Split(label, "-") {
			if part == word {
				return true
			}
		}
	}
	return false
}

func titleBait(title string) (string, bool) {
	t := strings.ToLower(title)
	if t == "" {
		return "", false
	}
	for _, word := range []string{"otp", "kyc", "aadhaar", "aadhar", "upi pin", "account locked", "verify your", "update kyc"} {
		if strings.Contains(t, word) {
			return word, true
		}
	}
	return "", false
}

func lastLabel(host string) string {
	parts := strings.Split(strings.Trim(host, "."), ".")
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

func hyphenCount(host string) int {
	return strings.Count(host, "-")
}

func hiddenRunes(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Cf, r) || r == '\u200b' || r == '\ufeff' || r == '\u2060' {
			return true
		}
	}
	return false
}
