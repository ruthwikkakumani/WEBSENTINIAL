# WebSentinel — Security Whitepaper

> **Document:** SEC-001  
> **Version:** 1.0.0  
> **Classification:** Public  
> **Last reviewed:** 2026-10-19

---

## 1. Threat Model

WebSentinel analyzes user-supplied URLs. Every analysis starts from an untrusted input. The system is designed as a _confused deputy_ — a component that an attacker could trick into doing something it should not, unless defences are layered at every point.

### 1.1 Assets protected

| Asset | Protection goal |
|---|---|
| User's credential material (cookies, tokens, passwords) | Never transmitted or stored |
| Internal network / cloud metadata | Never reachable from scanner egress |
| Assessment history | No paths, queries, or credentials stored |
| Scanner integrity | Privately-routed addresses never contacted |
| API keys | Runtime has no persistent secrets |

### 1.2 Trust boundaries

```
  User
   │
   │  TLS 1.3 ──► Public internet ──►
   ▼
┌──────────────┐
│  HTTP API    │  ← Trust boundary: input validation, rate limiting
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Guard       │  ← Trust boundary: URL & IP validation only
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Collectors  │  ← Trust boundary: no private ranges reachable
│  (DNS, TLS,  │
│   Page, RDAP)│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Score       │  ← Trust boundary: pure computation, no I/O
└──────────────┘
```

### 1.3 Attack vectors and mitigations

| Vector | Mitigation |
|---|---|
| SSRF via crafted URL | `guard` package blocks all private, loopback, link-local, multicast, and cloud metadata IPs |
| DNS rebinding | `dialPinned` resolves once and refuses any non-public answer; socket is pinned to checked IP |
| Credential exfiltration in URL | Userinfo stripped before any collector runs; only hostname and scheme reach collectors |
| Path traversal in history | `filepath.Join` with base; history records store only cleaned origins |
| ReDoS from regex | No user-influenced regex patterns; all collectors use bounded string operations |
| Race condition on concurrent assessments | Each assessment uses its own context; findings are merged after collection completes |
| Resource exhaustion | Per-assessment timeout (30s); rate limiter; bounded redirects (5 max); bounded page read (256 KiB) |
| Log injection | Structured logging with no raw URL emission |

---

## 2. How WebSentinel Prevents Abuse

### 2.1 Private address blocking

The `guard` package is the single chokepoint for all outbound connections. It implements:

```
guard.Control(network, address, c syscall.RawConn) error
guard.ResolvePublic(ctx, host) (net.IP, error)
```

**Blocked ranges:**

| Range | Reason |
|---|---|
| `127.0.0.0/8`, `::1/128` | Loopback |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC 1918 private |
| `100.64.0.0/10` | Carrier-grade NAT (RFC 6598) |
| `169.254.0.0/16`, `fe80::/10` | Link-local |
| `224.0.0.0/4`, `ff00::/8` | Multicast |
| `0.0.0.0/8`, `255.255.255.255/32` | Invalid/broadcast |
| `169.254.169.254/32` | Cloud metadata service |
| `fd00::/8` | Unique local address (ULA) |
| `fc00::/7` | Unique local unicast |
| `198.18.0.0/15` | Benchmarking (RFC 2544) |

DNS resolution uses `guard.ResolvePublic` which validates every returned address before allowing a connection. If *any* address is non-public, the resolution is rejected entirely.

### 2.2 Hostname guard

The `guard` package also validates hostnames:

- Bare IP addresses that are not public are rejected before DNS lookup.
- IDNA names (punycode) are decoded and checked for hidden characters.
- A time-limited DNS cache prevents the same host from being resolved repeatedly.

### 2.3 URL sanitisation

Before any collector runs:

1. The URL is parsed by `net/url.Parse`.
2. `url.Userinfo()` is checked — if present, the request is rejected (credentials in URLs are a phishing indicator).
3. The fragment is stripped.
4. Only `scheme` and `hostname` are passed to collectors.
5. The path and query are discarded from all recorded data.

### 2.4 Redirect safety

The `Page` collector follows at most 5 redirects. Each redirect destination is re-checked through `guard` before fetching. If a redirect targets a blocked address, the redirect chain stops immediately and a `redirect_blocked` finding is recorded.

---

## 3. Privacy Guarantees

### 3.1 What is sent

Only the **origin** (`scheme://hostname`) is sent to external services:

- **DNS:** Only the hostname for A/AAAA/SPF/DMARC lookups.
- **TLS:** Only the hostname for a TLS handshake on port 443.
- **Page:** Only an HTTP GET to `scheme://hostname/` with no cookies, no Authorization header, and no User-Agent that identifies the user.
- **RDAP:** Only the registered domain (not the subdomain or path).

### 3.2 What is never sent

- Path, query, fragment, userinfo, or password
- HTTP cookies or stored credentials
- Client IP (assessments are stateless)
- Browser fingerprint or device identifiers

### 3.3 What is stored

The history file stores:

| Field | Example | Note |
|---|---|---|
| `id` | `WS-40B68E88` | Random, no link to submitter |
| `assessedAt` | ISO 8601 UTC | When assessment ran |
| `origin` | `https://example.com` | Only scheme + hostname |
| `registrableDomain` | `example.com` | Public suffix + one label |
| `verdict` | `safe` | One of three bands |
| `findings` | `[...]` | Observations (no raw URLs) |

Paths, queries, fragments, and timing signatures are never stored.

---

## 4. Rate Limiting

### 4.1 Per-client token bucket

```
Type:        Token bucket
Capacity:    20 tokens
Refill:      1 token per second (steady state)
Burst:       60 tokens (warm-start allowance)
Key:         Client IP (hashed)
```

When the bucket is empty, the API returns:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{"error":"rate_limited","message":"Try again later."}
```

### 4.2 Per-URL deduplication

The same origin assessed within 60 seconds returns the cached assessment without re-running collectors. This prevents a single URL from being used to exhaust rate limits.

### 4.3 Global concurrency limit

Maximum 8 concurrent assessments. Additional requests queue with a 15-second deadline. If the queue is full, the request receives:

```
HTTP/1.1 503 Service Unavailable
```

---

## 5. TLS Configuration

### 5.1 Server (API)

| Setting | Value |
|---|---|
| Minimum version | TLS 1.2 |
| Preferred version | TLS 1.3 |
| Cipher suites (TLS 1.2) | `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256`, `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` |
| Curve preference | X25519, P-256 |
| HTTP/2 | Enabled (h2) |
| HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains` |

### 5.2 Client (outbound to target websites)

| Setting | Value |
|---|---|
| Minimum version | TLS 1.2 |
| InsecureSkipVerify | True (to read expired/misissued certificates) |
| Cert validation | Separate check records `Valid` boolean; certificate chains are not trusted |
| Server name | Set to target hostname |
| Root CAs | System pool (read-only) |

The security impact of `InsecureSkipVerify` is limited: the collector reads the leaf certificate for analysis; it does not authenticate the remote server. The `Valid` field tells the user whether the certificate would be trusted by a standard browser.

---

## 6. No Persistent Credentials

WebSentinel has **no API keys, no authentication tokens, no database credentials** built into the binary or runtime. It runs as a non-root user (UID 65534 in the container) with zero secrets.

The only runtime configuration is:
- Listening address (`-addr`)
- RDAP backend URL (`-rdap`)
- History file path (`-data`)

None of these are secrets.

---

## 7. Security Audits

| Date | Scope | Findings | Status |
|---|---|---|---|
| 2026-10-01 | Guard package (SSRF) | None critical | Clean |
| 2026-10-15 | Full service integration | Low: add missing hostname validation on input | Fixed |
| 2026-10-19 | TLS and RDAP collectors | None | Clean |

---

## 8. Compliance Considerations

| Requirement | Status |
|---|---|
| OWASP ASVS (Level 2) | Compliant |
| GDPR Article 5 (data minimisation) | Compliant — only origin stored |
| CWE-918 (SSRF) | Mitigated at package `guard` |
| CWE-200 (Information Exposure) | Mitigated — no raw URLs in logs or responses |
| CWE-352 (CSRF) | No state-changing endpoints without safe methods |
| PCI DSS 6.5 | Compliant — no card data processed |

---

*This document is maintained alongside the source. Security controls are tested in `guard_test.go`.*