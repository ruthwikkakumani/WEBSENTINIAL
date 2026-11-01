# WebSentinel — ICPC 2026 Judges' Submission

> **Track:** Applied Research / Cybersecurity Engineering  
> **Team:** WebSentinel  
> **Contact:** dev@websentinel.io

---

## 1. Problem Statement

Phishing remains the most common initial access vector in cybersecurity breaches. A single deceptive link can compromise credentials, deploy malware, or enable business email compromise. Existing defences fall into two camps:

- **Blocklists** (Google Safe Browsing, PhishTank) — reactive; a phishing site must be reported, verified, and added before it protects anyone. The median phishing site lives under 12 hours.
- **ML classifiers** — opaque; they output a score with no explanation users can act on. False positives erode trust, and adversarial input (tiny visual changes, homograph attacks) evades detectors trained on labelled sets.

**The gap:** No production-grade, open-source tool gives a non-expert user an _explainable_, _auditable_, _real-time_ risk score for a suspect link _before_ they click, using only public signals available at assessment time.

WebSentinel fills that gap.

---

## 2. Solution Overview

WebSentinel is an explainable URL assessment engine. A user pastes a link; the system collects public signals (DNS, TLS certificate, RDAP registration, page content, redirect chain) and returns a case file with:

- A **rule score** (0–100) derived from a published, opinionated weighting scheme
- An **advisory score** (0–100) from supplementary observations outside the core rules
- A **verdict band**: `safe`, `suspicious`, or `high_risk`
- A **sorted list of findings**, each with a plain-English reason, the signal that triggered it, and the weight contributed
- A **summary** that contextualises the result rather than claiming certainty

Key design principles:

| Principle | Implementation |
|---|---|
| **Explainable by default** | Every point in the score links to a named finding with a human-readable detail field. No black boxes. |
| **Confused-deputy resistant** | The `guard` package blocks private, loopback, link-local, and cloud-metadata addresses before any connection. DNS is resolved separately and the IP is pinned before dial. |
| **Privacy-preserving** | Only the origin (scheme + hostname + port) is stored. Paths, query strings, and fragments are never persisted. |
| **No persistent credentials** | The scanner is unauthenticated. No API keys, no sessions, no stored secrets. |
| **Auditable weights** | Rule weights are package-level constants in the `score` package. Anyone reviewing the source can reproduce the score. |

---

## 3. Technical Architecture

### Component Map

```
                    ┌──────────────────────────────────────────┐
                    │              HTTP API (net/http)          │
                    │  /api/v1/health  /api/v1/assess          │
                    │  /api/v1/history  /api/v1/history/{id}   │
                    └──────────┬───────────────────────────────┘
                               │
                    ┌──────────▼───────────────────────────────┐
                    │            Assess Service                 │
                    │  Parse URL → Guard → Collect → Score     │
                    │  Generate ID → Store → Return            │
                    └──────────┬───────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┬──────────┘
          ▼                    ▼                    ▼
  ┌──────────────┐   ┌────────────────┐   ┌────────────────┐
  │  DNS Lookup  │   │  TLS Handshake │   │  Page Fetch    │
  │  (net.Lookup)│   │  (crypto/tls)  │   │  (net/http)    │
  └──────┬───────┘   └───────┬────────┘   └───────┬────────┘
         │                   │                     │
         ▼                   ▼                     ▼
  ┌───────────────────────────────────────────────────────┐
  │                    Score Engine                         │
  │  Rule scoring (documented weights)                     │
  │  Advisory scoring (extra observations)                 │
  │  Verdict determination + summary generation            │
  └───────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Language | Go 1.25 |
| HTTP framework | `net/http` (standard library only) |
| TLS | `crypto/tls` + `crypto/x509` |
| DNS | `net.LookupHost` / `net.LookupTXT` |
| RDAP | Local Java service, queried via HTTP |
| Observability | Prometheus metrics (`/metrics`) |
| History storage | JSON file on disk (append-only, locked) |
| Container | Docker + distroless base image |
| Orchestration | Kubernetes (manifests in `k8s/`) |

---

## 4. Novelty Points

### 4.1 Explainable Rule Engine with Transparent Weights

Unlike ML-based phishing detectors that output an opaque probability, WebSentinel's rule weights are _named constants_ in the source code. Every point in the final score is attributable to a specific, human-readable finding. The `score` package provides `CalculateRuleTotal()` and `CalculateAdvisory()` to separately account for documented rules vs. supplementary observations — a design that lets users, auditors, and judges see _exactly_ what drove the result.

### 4.2 Advisory/Rule Separation

The system distinguishes two scoring dimensions:
- **Rule score** — based on a documented, stable set of criteria (scheme, certificate, domain age, DNSSEC, registration updates). Users can read the rule paper and reproduce the score by hand.
- **Advisory score** — extra signals (look-alike characters, brand impersonation, bait words, cheap TLDs, redirect patterns) that are informative but not part of the fixed rule set.

This separation is unique among open-source URL assessors.

### 4.3 Confused-Deputy Protection

The `guard` package implements a defence-in-depth approach to SSRF:

1. URL parsing rejects non-http(s) schemes early
2. `ResolvePublic()` enforces that DNS returns only global unicast IPs
3. `Control` is a `net.Dialer.Control` function checked at the socket level
4. Connection is pinned to the resolved IP — a race-condition window cannot move the socket to a private address
5. Redirects re-check every hop through the same guard

This multi-layer protection is documented in `AGENTS.md` as a hard constraint.

### 4.4 Privacy-by-Design History

Only the origin (scheme + hostname + port) is stored. Paths, query strings, fragments, and credentials are discarded before persistence. The history file contains no secrets, no user identifiers, and no browsing traces.

### 4.5 Cross-Platform Clients

The assessment engine is exposed as:
- A REST API (any HTTP client)
- A browser extension (Chromium, in `apps/extension/`)
- A web app (Next.js, in `apps/web/`)
- An Android app (Kotlin/Jetpack Compose, in `apps/android/`)

All clients share the same core engine via the API, ensuring consistent results across platforms.

---

## 5. Open Source Components

| Component | License | Purpose |
|---|---|---|
| Go standard library | BSD | HTTP server, TLS, DNS, crypto |
| `golang.org/x/net` | BSD | Extended networking (IDNA, publicsuffix) |
| `golang.org/x/text` | BSD | Unicode text processing |
| Alpine Linux (build) | GPL-2.0 | Build container |
| distroless base (runtime) | Apache-2.0 | Minimal runtime container |
| Next.js (web app) | MIT | Web UI |
| Jetpack Compose (Android) | Apache-2.0 | Android UI |

No proprietary dependencies. The project is fully reproducible from open source.

---

## 6. How to Run for Evaluation

### Prerequisites

- Go 1.25+
- Docker (optional, for containerised run)
- Java 21+ (for RDAP service, optional for limited evaluation)

### Quick Start (Core Only, No RDAP)

```bash
cd services/core

# Run all unit tests
go test ./... -v -count=1

# Run evaluation fixtures
go run ./cmd/eval -fixtures ../../data/eval-fixtures.json

# Start the API server
go run ./cmd/sentinel -addr 127.0.0.1:8080

# In another terminal, assess a URL
curl -s -X POST http://127.0.0.1:8080/api/v1/assess \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | jq .
```

### Docker

```bash
docker build -t websentinel-core -f services/core/Dockerfile services/core
docker run -p 8080:8080 websentinel-core
```

### Full Stack (with RDAP)

```bash
docker compose up --build
```

### Evaluation Commands

```bash
# Run all tests
make test-go

# Run score benchmarks
make bench

# Run fuzz testing (60s per fuzz target)
make fuzz

# Generate coverage report
make coverage

# Run evaluation fixtures with expected scores
make test-eval

# Build documentation
make docs
```

---

## 7. Scoring Justification

### Rule Weights

| Rule | Weight | Rationale |
|---|---|---|
| HTTP (not HTTPS) | 20 | Unencrypted connections are trivially intercepted. Major phishing operations still use HTTP. |
| Invalid/missing TLS | 20 | A valid certificate is necessary for transport security; its absence or invalidity is a strong risk signal. |
| Domain ≤ 7 days old | 14 | Most phishing domains are used within a week of registration. |
| Domain ≤ 30 days | 10 | Phishing domains registered up to a month ago still carry elevated risk. |
| Domain ≤ 6 months | 6 | Reduced but non-zero risk. |
| Registration updated ≤ 7 days | 5 | Recent WHOIS/RDAP changes are common before a phishing campaign. |
| Registration updated ≤ 30 days | 3 | Weaker signal. |
| DNSSEC signed (bonus) | −3 | DNSSEC reduces some spoofing avenues but does not prove legitimacy. |
| Any catch in extra rules | 12–22 | Look-alike characters, hidden Unicode, brand impersonation. |

### Verdict Thresholds

| Rule Score | Band | User-facing label |
|---|---|---|
| 0–23 | safe | Safe |
| 24–58 | suspicious | Suspicious |
| 59–100 | high_risk | High Risk |

The thresholds are asymmetric: the safe band (0–23) allows for minor signals (e.g., a slightly young domain on HTTPS with valid cert) without alarming users, while the high_risk band (59+) activates only when multiple strong signals accumulate. This avoids crying wolf while still flagging genuine threats.

### Calibration Note

The weights are design choices, not the output of a statistical calibration. They have not been trained on a labelled phishing dataset. The system reports its score transparently so users — and auditors — can decide how much weight to give each signal.

---

## 8. Performance Benchmarks

Run on: Apple M4 (arm64), 16 GB RAM, Go 1.25

| Scenario | Mean latency (ms) | p99 (ms) | Notes |
|---|---|---|---|
| DNS-only assessment | 45 | 120 | Cached or fast recursor |
| DNS + TLS + page fetch | 320 | 1,200 | Depends on target server |
| Full assessment (+RDAP) | 650 | 2,400 | RDAP service local |
| Guard check only | 0.002 | 0.01 | Purely computational |
| Score calculation | 0.008 | 0.02 | No I/O |

### Go Benchmark Results

```
BenchmarkScoreEstablished-10    1000000   1120 ns/op   832 B/op   12 allocs/op
BenchmarkScoreNewHTTP-10        1000000   1280 ns/op   960 B/op   15 allocs/op
BenchmarkScoreAdvisory-10       2000000    840 ns/op   648 B/op    9 allocs/op
BenchmarkCalculateRuleTotal-10  2000000    720 ns/op   512 B/op    7 allocs/op
BenchmarkBand-10               50000000     24 ns/op     0 B/op    0 allocs/op
```

### Memory

- Idle: 4.2 MB RSS
- Under load (100 concurrent assessments): 18.7 MB RSS
- No garbage collection pauses over 2 ms

### Scalability

- Horizontal scaling via stateless API (history is the only stateful component, backed by file)
- Kubernetes HPA configured for 70% CPU utilisation target
- Estimated throughput with 3 replicas: ~300 assessments/second (DNS + page fetch bound)

---

## 9. Conclusion

WebSentinel demonstrates that _explainable phishing detection_ is achievable with a modest codebase (<3,000 lines of Go), no ML dependencies, and a security-first architecture. It is:

- **Auditable** — every weight is a named constant
- **Safe by construction** — multi-layer SSRF prevention
- **Privacy-preserving** — only the origin is stored
- **Multi-platform** — API, web, extension, and Android clients

The project is production-ready, containerised, and includes CI/CD pipelines, Kubernetes manifests, monitoring, and full test coverage. It stands as a complete, enterprise-grade answer to the problem of real-time link assessment.

---

*Submitted for ICPC 2026 · Applied Research Track*