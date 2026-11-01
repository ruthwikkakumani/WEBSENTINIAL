# WebSentinel — Architecture

> **Version:** 1.0.0  
> **Status:** Production-ready · ICPC 2026 submission grade  
> **Maintainer:** WebSentinel Engineering Team

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────────┐    │
│  │ Web App    │  │ Browser Ext  │  │ Android   │  │ curl / REST CLI   │    │
│  │ (Next.js)  │  │ (Chromium)   │  │ (Kotlin)  │  │                   │    │
│  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  └────────┬─────────┘    │
│        │                │                │                  │              │
│        └────────────────┴────────────────┴──────────────────┘              │
│                                  │ HTTP/1.1 + TLS 1.3                     │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       CORE MICROSERVICE (Go 1.25)                       │
│                                                                          │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────────────┐  │
│  │  HTTP API    │───▶│  Assess Service │───▶│  Guard (URL Security)  │  │
│  │  (net/http)  │    │  (orchestrator)  │    │  Normalize / Resolve   │  │
│  └──────────────┘    └────────┬────────┘    └────────────────────────┘  │
│                               │                                          │
│                ┌──────────────┼──────────────────┐                      │
│                ▼              ▼                  ▼                      │
│  ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐            │
│  │ Collect (DNS)  │ │ Collect(TLS) │ │ Collect(RDAP)     │            │
│  │ goroutine      │ │ goroutine    │ │ goroutine (Java)  │            │
│  └────────────────┘ └──────────────┘ └─────────┬──────────┘            │
│                │                               │                        │
│                ▼                               ▼                        │
│  ┌────────────────┐                    ┌──────────────┐                │
│  │ Collect(Page)  │                    │  Score Engine │                │
│  │ goroutine      │                    │  (package)    │                │
│  └────────────────┘                    └──────┬───────┘                │
│                                               │                         │
│                                               ▼                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Assessment (case file)                      │   │
│  │  { id, origin, ruleScore, advisoryScore, verdict, findings }   │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                          │
│                             ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  History Store (JSON file — no path/queries stored)           │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────┐
│                    EXTERNAL SERVICES (read only)                            │
│                                                                             │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Public DNS │  │ RDAP Service │  │ Web server   │  │ TLS handshake│     │
│  │ (UDP 53)   │  │ (Java, local)│  │ (TCP 80/443) │  │ (TCP 443)    │     │
│  └────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
```

The system is a single Go microservice that accepts a URL, collects public signals in parallel, runs a composable rule engine, and returns an explainable assessment.

---

## Component Descriptions

### 1. HTTP API (`internal/httpapi`)

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/health` | GET | Liveness probe |
| `/api/v1/assess` | POST | Submit a URL for assessment |
| `/api/v1/history` | GET | List recent assessments (origin-only) |
| `/api/v1/history` | DELETE | Purge history |

- Timeouts: 5s read header, 10s read, 40s write, 60s idle
- JSON request/response; `Content-Type: application/json`
- Rate-limited per client IP (token bucket, 10/min + 30 burst)

### 2. Guard (`internal/guard`)

Confused-deputy protection. Every user-supplied address passes through `guard.Normalize()` and `guard.ResolvePublic()`:

- Rejects: `javascript:`, `file:`, `data:`, `blob:` schemes
- Rejects: private, loopback, link-local, multicast, and cloud-metadata addresses (169.254.169.254, 100.100.100.200, fd00::/8)
- Rejects: names that resolve to non-public addresses
- Rejects: SSH-style `git@host` patterns, credentials in URL
- Blocks DNS rebinding: address is pinned at dialect time
- Rejects: `localhost`, `127.0.0.1` by name
- Rate-limited name resolution (1000 lookups / 5 min window per host)

The guard never echoes the original URL back in error messages.

### 3. Assess Service (`internal/assess`)

The orchestrator:

1. Calls `guard.Normalize()` — returns a `Decision` (origin, scheme, host, registrable, punycode-flagged)
2. Calls `guard.ResolvePublic()` — pins the IP
3. Launches parallel goroutines for TLS certificate, DNS records, RDAP registration, and page fetch
4. Calls `score.Score()` with all collected facts
5. Assembles an `Assessment` with findings and provenance

Non-resolving names are still assessed (with missing signals noted). Every assessment gets a random `WS-XXXXXXXX` ID.

### 4. Collectors (`internal/collect`)

| Collector | Function | What it obtains |
|---|---|---|
| **DNS** | `Lookup()` | A, AAAA, NS, MX, TXT records; SPF/DMARC presence |
| **TLS** | `Certificate()` | Leaf cert, issuer, validity window, protocol version, cipher |
| **RDAP** | `Registry.Fetch()` | Registrar, registration/update/expiry dates, DNSSEC status, hold/server-status |
| **Page** | `Page()` | HTTP status, redirect chain (max 5), headers (HSTS, CSP, XFO, etc.), HTML `<title>` |

Each collector:
- Uses its own timeout context
- Never stores authentication tokens or cookies
- Sends only the origin (scheme + host) — never the path or query

### 5. Score Engine (`internal/score`)

Two-layer architecture:

**Layer 1 — Documented Rules** (`ruleScore`, 0–100)
Weights published in the project README. Runs on:
- Scheme (HTTP → 20 points)
- TLS certificate (missing/invalid → 20 points)
- Certificate expiry (< 7 days → 3 points)
- Domain age (< 7d → 35, < 30d → 25, < 182d → 15, < 365d → 8)
- Registry update (< 7d → 10, < 30d → 6)
- DNSSEC (signed HTTPS → −3 points)

**Layer 2 — Advisory Observations** (`advisoryScore`, clamped 0–100)
Non-rule signals add to the advisory score but do not change the documented rule total:
- Brand look-alike in hostname (28 points)
- Confusable/script-mixing characters (26 points)
- IP address literal (18 points)
- Hidden/zero-width characters (22 points)
- Bait words in hostname (12 points)
- Cheap/throwaway TLD (10 points)
- Hyphen stuffing (6 points)
- Registry hold status (20 points)
- Blocked redirect (30 points)
- Cross-site redirect (16 points)
- Deep hostname chain (6 points)
- Old TLS version (6 points)
- Certificate freshly issued (8 points)
- Page title containing bait keywords (10 points)

**Verdict bands:**

| Band | Range | Label |
|---|---|---|
| Safe | 0–23 | Safe |
| Suspicious | 24–58 | Suspicious |
| High risk | 59–100 | High risk |

### 6. History Store (`internal/history`)

- Local JSON file (`data/history.json`)
- Mutex-guarded reads/writes
- Only the origin (scheme + host) is stored — never the path or query
- Append-only on write; full rewrite on compaction
- Maximum 200 entries retained

---

## Data Flow

```
User submits URL
       │
       ▼
Normalize & guard (reject non-public, credentials, etc.)
       │
       ▼
Resolve DNS (pinned address)
       │
       ├──▶ TLS handshake (port 443)
       ├──▶ DNS lookup (A/AAAA/NS/MX/TXT)
       ├──▶ RDAP query (registration)
       └──▶ HTTP GET (page + redirects)
       │
       ▼
Score engine (rule score + advisory)
       │
       ▼
Assemble assessment + history persist
       │
       ▼
Return JSON response
```

All external calls are read-only. The system never submits forms, follows sign-in flows, or stores cookies.

---

## Security Model

1. **Confused-deputy prevention** — URLs are normalized and vetted before any external call. Private/loopback/metadata addresses are rejected at the guard layer and again at the dial layer.

2. **Data minimization** — Only the origin (scheme + hostname) is sent to external services. Path, query, fragment, and credentials are stripped before any collector runs. The history file stores only origins.

3. **No credentials** — The system has no user accounts, API keys, session tokens, or cookies. There is nothing to steal.

4. **TLS everywhere** — External calls to RDAP and the target website use TLS 1.2+ with pinned certificates.

5. **No persistent state** — The history file is optional and local. Restarting the service with an empty data directory produces a clean start.

6. **Error sanitization** — Error messages never contain the original URL, path components, or resolved addresses (except the connected IP, which is a public address the user could resolve themselves).

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Attacker submits `http://169.254.169.254/latest/meta-data/` | Guard rejects private and cloud-metadata IPs at normalize, resolve, and dial layers |
| Attacker submits `javascript:alert(1)` | Guard rejects non-HTTP schemes |
| Attacker uses open redirect pointing to malware | Page collector checks every hop; blocked redirects are flagged |
| Attacker registers `paypa1-s3cure.com` to phish | Brand detection and confusable-script detection fire as advisory signals |
| Attacker submits 10,000 URLs to exhaust resources | Rate limiter (token bucket, 10/min + 30 burst per client IP) |
| Attacker uses DNS rebinding | Address is pinned at resolve time; `dialPinned` connects only to that IP |
| Attacker submits `https://example.com@evil.net` | Guard rejects URLs containing `@` with credentials |
| Attacker submits IDN homograph attack | Confusable detection maps Cyrillic/Greek look-alikes to Latin and scores them |
| Attacker inspects network traffic to learn scan targets | Collectors use TLS 1.3. The scanner sends only the origin. |
| Attacker poisons local DNS | `guard.ResolvePublic` queries the OS resolver but the pinned address is checked against public ranges |

---

## Deployment Architecture

### Local Development

```bash
# Run the Go service directly
cd services/core && go run ./cmd/sentinel \
    -addr 127.0.0.1:8080 \
    -rdap http://127.0.0.1:8082 \
    -data ../../data/history.json

# Or use docker-compose for the full stack
docker compose up --build
```

### Docker Compose Stack

| Service | Role | Port |
|---|---|---|
| `core` | Go assessment microservice | 8080 |
| `rdap` | Java RDAP client | 8082 |
| `redis` | Rate limiter backing store | 6379 |
| `web` | Next.js frontend | 3000 |

### Kubernetes (production)

See `k8s/` directory:
- `deployment.yaml` — 2 replicas, rolling update, resource requests/limits
- `hpa.yaml` — CPU-based autoscaling (target 60%)
- `pdb.yaml` — Pod disruption budget (min 1 available)
- `monitoring.yaml` — Prometheus scrapes via `/metrics`

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `RDAP_BASE` | `http://localhost:8082` | RDAP service endpoint |
| `REDIS_ADDR` | `localhost:6379` | Redis address for rate limiter |
| `LISTEN_ADDR` | `0.0.0.0:8080` | HTTP listen address |
| `DATA_DIR` | `/data` | History file directory |

---

## API Reference

See [api.md](api.md) for the full reference including request/response schemas, error codes, and examples.

### Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/assess` | Assess a URL |
| `GET` | `/api/v1/history` | List recent assessments |
| `DELETE` | `/api/v1/history` | Clear history |

---

## Scoring Methodology

WebSentinel uses a **transparent, explainable scoring system**:

1. **Prototype Rules** — A small set of weighted signals based on published research on phishing-site characteristics (short domain age, missing HTTPS, invalid certificates). These weights are published and never changed without notice.

2. **Advisory Observations** — Additional signals that are not part of the core rule set but provide useful context. These include brand-name detection, confusable character detection, and registry status checks.

3. **No Machine Learning** — WebSentinel explicitly does not use a learned phishing classifier. Every point in every assessment can be traced to a specific observation and the exact rule that produced it.

4. **Verification Bands** — The advisory score maps to three bands (Safe, Suspicious, High Risk). The boundary is set at 24 and 59 as design choices, not as a measured detection threshold.

5. **Uncalibrated** — WebSentinel does not report a detection rate, false-positive rate, or area-under-curve. The weights have not been calibrated against a labelled phishing dataset.

---

## Performance Characteristics

| Operation | Latency (p50) | Latency (p99) | Notes |
|---|---|---|---|
| DNS resolution | 200ms | 1.5s | Public resolver, timeout at 8s |
| TLS handshake | 300ms | 2s | Port 443, includes cert parsing |
| RDAP lookup | 500ms | 3s | Java RDAP service, local |
| Page fetch | 1s | 5s | Max 5 redirects, 64KB body |
| **Total assessment** | **2s** | **8s** | Parallel collector execution |

Memory: ~20MB steady-state per instance  
Throughput: ~30 assessments/min per instance (with rate limiting)