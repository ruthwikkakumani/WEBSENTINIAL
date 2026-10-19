package collect

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"websentinel/core/internal/guard"
	"websentinel/core/internal/model"
)

// Lookup reads public DNS. It does not open a connection to the site.
func Lookup(ctx context.Context, host, pinned, apex string) *model.DNS {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out := &model.DNS{}
	r := net.DefaultResolver

	if ip := net.ParseIP(host); ip != nil {
		if guard.IsPublic(ip) {
			out.Addresses = []string{ip.String()}
		}
		if pinned != "" {
			if ptrs, err := r.LookupAddr(ctx, pinned); err == nil {
				out.Pointers = clipList(trimDots(ptrs), 4)
			}
		}
		return out
	}

	if ips, err := r.LookupIPAddr(ctx, host); err != nil {
		out.Error = "The DNS lookup failed, so address records are missing."
	} else {
		for _, ip := range ips {
			if guard.IsPublic(ip.IP) {
				out.Addresses = append(out.Addresses, ip.IP.String())
			}
		}
	}
	if pinned != "" {
		if ptrs, err := r.LookupAddr(ctx, pinned); err == nil {
			out.Pointers = clipList(trimDots(ptrs), 4)
		}
	}
	if ns, err := r.LookupNS(ctx, host); err == nil {
		for _, item := range ns {
			out.Nameservers = append(out.Nameservers, strings.TrimSuffix(item.Host, "."))
		}
	}
	if mx, err := r.LookupMX(ctx, host); err == nil {
		for _, item := range mx {
			out.MailServers = append(out.MailServers, fmt.Sprintf("%d %s", item.Pref, strings.TrimSuffix(item.Host, ".")))
			if len(out.MailServers) == 6 {
				break
			}
		}
	}
	if txt, err := r.LookupTXT(ctx, host); err == nil {
		for _, item := range txt {
			if strings.HasPrefix(strings.ToLower(strings.TrimSpace(item)), "v=spf1") {
				out.HasSPF = true
			}
			if len(item) > 180 {
				item = item[:180] + "…"
			}
			out.Text = append(out.Text, item)
			if len(out.Text) == 6 {
				break
			}
		}
	}
	zone := apex
	if zone == "" {
		zone = host
	}
	if dmarc, err := r.LookupTXT(ctx, "_dmarc."+zone); err == nil {
		for _, item := range dmarc {
			if strings.Contains(strings.ToLower(item), "v=dmarc1") {
				out.HasDMARC = true
				if len(item) > 180 {
					item = item[:180] + "…"
				}
				out.Text = append(out.Text, "DMARC "+item)
				break
			}
		}
	}
	return out
}

func trimDots(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		out = append(out, strings.TrimSuffix(s, "."))
	}
	return out
}

func clipList(in []string, n int) []string {
	if len(in) <= n {
		return in
	}
	return in[:n]
}
