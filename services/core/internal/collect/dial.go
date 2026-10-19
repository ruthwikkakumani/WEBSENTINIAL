package collect

import (
	"context"
	"errors"
	"net"
	"net/url"
	"strings"
	"time"

	"websentinel/core/internal/guard"
)

// dialPinned resolves host, refuses any non-public answer, and connects to
// the checked IP. A later DNS change cannot move this socket.
func dialPinned(ctx context.Context, host, port string) (net.Conn, error) {
	ip, err := guard.ResolvePublic(ctx, host)
	if err != nil {
		return nil, err
	}
	d := &net.Dialer{
		Timeout: 8 * time.Second,
		Control: guard.Control,
	}
	return d.DialContext(ctx, "tcp", net.JoinHostPort(ip.String(), port))
}

func explain(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, guard.ErrNonPublic) || errors.Is(err, guard.ErrBlockedName) {
		return "non-public"
	}
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "Timeout") || strings.Contains(err.Error(), "deadline") {
		return "The site did not answer before the time limit."
	}
	var ue *url.Error
	if errors.As(err, &ue) && ue.Err != nil {
		return explain(ue.Err)
	}
	return clip(err.Error())
}

func clip(s string) string {
	if len(s) > 240 {
		return s[:240]
	}
	return s
}
