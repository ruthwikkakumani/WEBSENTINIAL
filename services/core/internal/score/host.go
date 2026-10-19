package score

import (
	"fmt"
	"net"
	"strings"
	"unicode"

	"websentinel/core/internal/model"
)

// brands are tokens that phishers put in a look-alike host. The registered
// domain's own first label is never treated as an impostor.
var brands = map[string]string{
	"paypal": "PayPal", "apple": "Apple", "icloud": "Apple", "microsoft": "Microsoft",
	"office": "Microsoft", "outlook": "Microsoft", "google": "Google", "gmail": "Google",
	"amazon": "Amazon", "netflix": "Netflix", "instagram": "Instagram", "facebook": "Facebook",
	"whatsapp": "WhatsApp", "github": "GitHub", "dropbox": "Dropbox", "adobe": "Adobe",
	"linkedin": "LinkedIn", "coinbase": "Coinbase", "binance": "Binance", "discord": "Discord",
	"steam": "Steam", "docusign": "DocuSign", "openai": "OpenAI", "chatgpt": "ChatGPT",
	"wellsfargo": "Wells Fargo", "bankofamerica": "Bank of America",
	"sbi": "State Bank of India", "onlinesbi": "State Bank of India", "hdfc": "HDFC Bank",
	"hdfcbank": "HDFC Bank", "icici": "ICICI Bank", "icicibank": "ICICI Bank",
	"axisbank": "Axis Bank", "kotak": "Kotak", "yesbank": "Yes Bank",
	"pnb": "Punjab National Bank", "unionbank": "Union Bank",
	"paytm": "Paytm", "phonepe": "PhonePe", "bhim": "BHIM", "upi": "UPI",
	"razorpay": "Razorpay", "cred": "CRED", "groww": "Groww",
	"irctc": "IRCTC", "uidai": "UIDAI", "incometax": "Income Tax",
	"epfindia": "EPFO", "gst": "GST",
	"canarabank": "Canara Bank", "bankofbaroda": "Bank of Baroda",
	"indianbank": "Indian Bank", "indusind": "IndusInd",
	"federalbank": "Federal Bank", "bandhan": "Bandhan Bank",
	"npci": "NPCI", "digilocker": "DigiLocker", "cowin": "CoWIN",
	"mygov": "MyGov", "yono": "YONO", "sbicard": "SBI Card",
}

var confusable = map[rune]rune{
	'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
	'і': 'i', 'ѕ': 's', 'һ': 'h', 'ј': 'j', 'ɡ': 'g', 'ѡ': 'w',
	'Α': 'a', 'α': 'a', 'Β': 'b', 'Ε': 'e', 'ε': 'e', 'Ζ': 'z', 'Η': 'h',
	'Ι': 'i', 'ι': 'i', 'Κ': 'k', 'Μ': 'm', 'Ν': 'n', 'ν': 'v', 'Ο': 'o',
	'ο': 'o', 'Ρ': 'p', 'ρ': 'p', 'Τ': 't', 'τ': 't', 'Υ': 'y', 'υ': 'u',
	'Χ': 'x', 'χ': 'x',
}

func hostFindings(f Facts) []model.Finding {
	host := strings.ToLower(f.UnicodeHost)
	if host == "" {
		host = strings.ToLower(f.Hostname)
	}
	var out []model.Finding
	if ip := net.ParseIP(f.Hostname); ip != nil {
		out = append(out, model.Finding{
			ID: "ip_literal", Signal: "Hostname", Severity: "caution", Weight: wIP, Rule: false,
			Title:    "The address is a raw IP, not a name",
			Detail:   "Ordinary websites you are asked to trust almost always use a domain name. A bare address is harder to recognize and easier to swap.",
			Evidence: ip.String(),
		})
		return out
	}

	folded, changed := foldConfusable(host)
	if changed {
		extra := ""
		if name := brandIn(folded); name != "" {
			extra = " It resembles " + name + "."
		}
		out = append(out, model.Finding{
			ID: "confusable_script", Signal: "Hostname", Severity: "risk", Weight: wLook, Rule: false,
			Title:    "The hostname uses look-alike letters",
			Detail:   "Some characters are not the Latin letters they appear to be. That is a common way to imitate a familiar name." + extra,
			Evidence: host + " → " + folded,
		})
	} else if strings.Contains(strings.ToLower(f.Hostname), "xn--") {
		out = append(out, model.Finding{
			ID: "punycode", Signal: "Hostname", Severity: "caution", Weight: wPuny, Rule: false,
			Title:    "This is an internationalized domain name",
			Detail:   "Non-Latin names are legitimate across the world. They are also a place look-alike characters hide, so the name is shown in its punycode form as well.",
			Evidence: f.Hostname,
		})
	}

	if !changed {
		if item, ok := brandFinding(host, f.Registrable); ok {
			out = append(out, item)
		}
	}
	if deepHost(host) {
		out = append(out, model.Finding{
			ID: "deep_host", Signal: "Hostname", Severity: "caution", Weight: wDeep, Rule: false,
			Title:    "The hostname has a long chain of labels",
			Detail:   "Several dots push the registered domain out of view. The name that matters is the registered domain, not the words on the left.",
			Evidence: f.Registrable,
		})
	}
	return out
}

func brandFinding(host, registrable string) (model.Finding, bool) {
	regFirst := firstLabel(registrable)
	for _, label := range strings.Split(host, ".") {
		cands := []string{label}
		cands = append(cands, strings.Split(label, "-")...)
		cands = append(cands, leet(label))
		seen := map[string]bool{}
		for _, cand := range cands {
			if seen[cand] {
				continue
			}
			seen[cand] = true
			display, ok := brands[cand]
			if !ok {
				continue
			}
			if regFirst == cand || brands[regFirst] == display {
				continue
			}
			return model.Finding{
				ID: "brand_lookalike", Signal: "Hostname", Severity: "risk", Weight: wBrand, Rule: false,
				Title:    "A familiar brand word is not the registered domain",
				Detail:   fmt.Sprintf("The hostname contains %s, but the registered domain is %s. Words on the left of a domain are chosen by whoever registered the name on the right.", display, emptyAs(registrable, host)),
				Evidence: label,
			}, true
		}
	}
	return model.Finding{}, false
}

func brandIn(folded string) string {
	for _, label := range strings.Split(folded, ".") {
		if display, ok := brands[label]; ok {
			return display
		}
		if display, ok := brands[leet(label)]; ok {
			return display
		}
	}
	return ""
}

func foldConfusable(host string) (string, bool) {
	changed := false
	var b strings.Builder
	for _, r := range host {
		if repl, ok := confusable[r]; ok {
			changed = true
			b.WriteRune(repl)
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String(), changed
}

func leet(s string) string {
	r := strings.NewReplacer("0", "o", "1", "l", "3", "e", "4", "a", "5", "s", "7", "t")
	return r.Replace(s)
}

func firstLabel(host string) string {
	if host == "" {
		return ""
	}
	return strings.Split(strings.ToLower(host), ".")[0]
}

func deepHost(host string) bool {
	n := 0
	for _, label := range strings.Split(host, ".") {
		if label != "" && label != "www" {
			n++
		}
	}
	return n >= 4
}

func emptyAs(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
