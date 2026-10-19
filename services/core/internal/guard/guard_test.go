package guard

import (
	"net"
	"strings"
	"testing"
)

func TestIsPublic(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
	}{
		{"8.8.8.8", true},
		{"1.1.1.1", true},
		{"93.184.216.34", true},
		{"127.0.0.1", false},
		{"10.1.2.3", false},
		{"192.168.1.1", false},
		{"172.16.0.1", false},
		{"172.31.255.255", false},
		{"172.15.0.1", true},
		{"169.254.169.254", false},
		{"169.254.170.2", false},
		{"0.0.0.0", false},
		{"255.255.255.255", false},
		{"100.64.0.1", false},
		{"192.0.2.1", false},
		{"198.51.100.1", false},
		{"203.0.113.1", false},
		{"198.18.0.1", false},
		{"224.0.0.1", false},
		{"240.0.0.1", false},
		{"::1", false},
		{"fc00::1", false},
		{"fd00::1", false},
		{"fe80::1", false},
		{"::ffff:127.0.0.1", false},
		{"::ffff:169.254.169.254", false},
		{"2001:4860:4860::8888", true},
		{"2001:db8::1", false},
	}
	for _, tc := range cases {
		ip := net.ParseIP(tc.ip)
		if ip == nil {
			t.Fatalf("did not parse %s", tc.ip)
		}
		if got := IsPublic(ip); got != tc.want {
			t.Errorf("IsPublic(%s) = %v, want %v", tc.ip, got, tc.want)
		}
	}
}

func TestNormalizePrivacyAndRefusals(t *testing.T) {
	d, err := Normalize("https://example.com/login?token=supersecret#frag")
	if err != nil {
		t.Fatal(err)
	}
	if d.Origin != "https://example.com" || !d.Discarded || d.Registrable != "example.com" {
		t.Fatalf("decision = %+v", d)
	}
	if strings.Contains(d.Origin, "supersecret") || strings.Contains(d.Host, "login") {
		t.Fatal("path or secret survived normalization")
	}

	refusals := []struct {
		raw  string
		code string
	}{
		{"http://127.0.0.1/admin?token=secret", "private_address"},
		{"http://[::1]/", "private_address"},
		{"http://169.254.169.254/latest/meta-data", "private_address"},
		{"http://10.0.0.5/", "private_address"},
		{"https://2130706433/secret", "private_address"},
		{"https://0x7f000001/", "private_address"},
		{"https://user:s3cret@example.com/a", "embedded_credentials"},
		{"chrome://settings", "unsupported_scheme"},
		{"javascript:alert(1)", "unsupported_scheme"},
		{"file:///etc/passwd", "unsupported_scheme"},
		{"https://example.com:8443/", "bad_port"},
		{"http://localhost/", "blocked_host"},
		{"http://printer.local/", "blocked_host"},
		{"http://metadata.google.internal/", "blocked_host"},
		{"https://intranet", "single_label"},
	}
	for _, tc := range refusals {
		_, err := Normalize(tc.raw)
		var ge *Error
		if !errorsAs(err, &ge) || ge.Code != tc.code {
			t.Errorf("Normalize(%q) err = %v, want code %s", tc.raw, err, tc.code)
			continue
		}
		if strings.Contains(ge.Error(), "secret") || strings.Contains(ge.Error(), "s3cret") || strings.Contains(ge.Error(), "meta-data") {
			t.Errorf("refusal echoed input: %s", ge.Error())
		}
	}
}

func TestRegistrableDomain(t *testing.T) {
	d, err := Normalize("https://WWW.Example.CO.UK/path")
	if err != nil {
		t.Fatal(err)
	}
	if d.Host != "www.example.co.uk" || d.Registrable != "example.co.uk" || d.Scheme != "https" {
		t.Fatalf("%+v", d)
	}
}

func errorsAs(err error, target **Error) bool {
	if err == nil {
		return false
	}
	ge, ok := err.(*Error)
	if !ok {
		return false
	}
	*target = ge
	return true
}
