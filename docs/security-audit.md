# Security audit of WebSentinel (our code)

Scope: this repository. Not third-party sites. Mode: guidance findings with source evidence. No exploit payloads.

## Trust boundaries

1. Browser / extension / Android → Go API on loopback.
2. Go → assessed public host on 80/443.
3. Go → Java on loopback with a domain name.
4. Java → public HTTPS RDAP.

## Findings

### W-1 CORS allows any `chrome-extension://` origin — accepted

`allowedOrigin` in `services/core/internal/httpapi/server.go` prefixes `chrome-extension://`. An unpacked extension has a random id. The API still binds to loopback and rate-limits. Do not bind to `0.0.0.0` without replacing this with an explicit extension id.

### W-2 Unauthenticated API — accepted for local demo

`POST /api/v1/assess` has no login. That is correct while the process listens on `127.0.0.1`. It is a critical finding if anyone listens on a public interface.

### F-1 Client did not refuse private literals before POST — fixed

`prepare()` used to send `http://127.0.0.1/` to the API, which then refused. The client now refuses the same class of hosts locally so a secret in the path never even becomes a request body.

### I-1 TLS `InsecureSkipVerify` on the handshake — accepted with control

`collect.Certificate` reads the leaf when verify would fail, then verifies against system roots and sets `Valid`. Do not reuse that tls.Config on the page GET. The page GET already requires TLS 1.2 and default verify.

### I-2 History file holds origins — accepted

`data/history.json` is mode 0600 and contains origins, scores, and public collector output. It must not grow to include paths or cookies.

## Tests that guard these

`internal/httpapi` refuses private addresses and must not echo secrets. `internal/guard` covers loopback, RFC1918, metadata, decimal and hex IPv4, credentials, and odd schemes.
