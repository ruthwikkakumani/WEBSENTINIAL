# WebSentinel: 3–5 minute SIH-style demo

## Positioning

WebSentinel is an explainable, privacy-conscious website-risk advisory prototype, not a certified detector or a guarantee that a site is legitimate. Present it as a proposed citizen-facing cybersecurity assistant with an inspectable collection boundary and actionable reasons. This guide makes no claim of official Smart India Hackathon eligibility, selection, sponsorship, problem-statement fit, or deployment endorsement. Confirm current official requirements separately before submitting.

## Before presenting

- Run `make test-go test-java` from the repository root. Frontend build and visual validation are separate responsibilities.
- Start only one stack: `./scripts/dev.sh`. It refuses startup if any of ports 5173, 8080, or 8082 is occupied; inspect existing processes rather than starting a duplicate.
- Open `http://127.0.0.1:5173`. Confirm the page actually renders; an HTTP 200 is not visual evidence.
- Check `curl --fail http://127.0.0.1:8080/api/v1/health` and `curl --fail http://127.0.0.1:8082/health`. Core should report `rdap: ok`. Health checks do not prove the public registry is reachable.
- Use only domains you control or have permission to assess for live collection. Do not run a bulk external scan for the presentation. Use no credentials or real private-link tokens.
- Keep an honest fallback: explain the refusal tests and architecture if public networking fails. Never label a fixture or old result as a fresh live assessment.

## Run of show

### 0:00–0:40 — The problem and promise

“People need understandable reasons for caution before trusting a link. WebSentinel checks a limited set of public technical signals and explains what it did and did not observe. A low score is not proof of safety.” Show the website and its privacy/limitations explanation.

### 0:40–1:40 — One authorized check

Enter an authorized public website. If demonstrating URL normalization, use a clearly fake suffix such as `/demo?example=demo#demo` rather than a sensitive link. In browser developer tools, show that the assessment request contains only the normalized origin. Explain that Go strips path, query, and fragment again as defense in depth; direct API callers can still send a full URL to Go, so the browser boundary must be checked separately.

Walk through the returned summary, reasons, checked/not-checked items, and collector availability. Do not promise a specific verdict or timing. Public DNS, TLS, headers, and registry answers vary; missing observations must not be presented as healthy observations.

### 1:40–2:40 — Explain the evidence

Show `ruleScore` separately from `advisoryScore`. Findings mark documented rule contributions with `rule: true`; extra observations remain distinguishable. The bands are heuristic guidance, not a calibrated probability. A valid TLS certificate proves neither organizational identity nor freedom from phishing.

If the UI offers local history, inspect it without clearing existing records. Explain that case files are stored locally in `data/history.json`; origins and assessment evidence are still sensitive browsing information even without paths.

### 2:40–3:30 — Demonstrate the safety boundary locally

This test is local and does not contact the supplied target:

```sh
curl -i -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1/private?token=DEMO_MARKER"}' \
  http://127.0.0.1:8080/api/v1/assess
```

Expect HTTP 400 with `code: private_address`, no marker echoed, and a message saying it was not contacted. Explain that ordinary target web ports only are accepted, non-public addresses are refused, and Go resolves then dials a checked IP with a socket guard. The registry client accepts only a configured loopback HTTP origin and does not follow redirects.

### 3:30–4:30 — Architecture and honest next steps

Browser → loopback Go API → public target signals; Go → loopback Java registry service → public RDAP. No cookies, passwords, form submissions, or scripts are sent to or executed on the assessed target. End with what needs validation before deployment rather than an invented detection rate.

## Origin-only contract: exact scope

- The client is intended to transmit scheme and hostname only. Default web ports normalize away; nonstandard target ports are refused.
- Go rejects embedded credentials, then discards input path/query/fragment before collection, logging, and case-file storage.
- Go makes unauthenticated root GET requests, reads selected headers and up to 64 KiB for a title, and traverses at most five redirect iterations. Each redirect is reduced to its origin; path-specific destinations are not assessed. It is not a full-browser crawler.
- TLS observation is on port 443; DNS and RDAP provide separate facts. Java receives a domain name, not the submitted URL.
- Target-supplied titles and selected headers are retained as evidence. Origin-only is not a claim that responses can never contain sensitive or malicious text.

## Limitations and production gaps

- No trained classifier, validated accuracy/recall/F1, measured detection rate, or performance guarantee. Fixture evaluation is a protocol, not a population-level result.
- No script execution, visual/logo matching, malware analysis, authenticated pages, exploit checks, or proof that an organization is genuine.
- Missing RDAP/DNS/TLS data can produce partial assessments. Health means service availability, not assessment completeness.
- Java checks registry addresses before requests but does not pin its HTTP connection to that checked DNS answer; production egress controls and a complete rebinding review remain needed.
- Local API is unauthenticated. CORS is not authentication. Before remote hosting: threat-model access, DNS rebinding/Host checks, CSRF-sensitive operations, per-user isolation, retention, deletion, encryption, request budgets, graceful shutdown, and durable storage.
- Docker/Compose syntax is locally validated, not image build/runtime validated: no reachable Docker daemon was available. Core Dockerfiles no longer require a shell in distroless or use the nonexistent `-health` mode. Compose uses loopback host publishing and shared core/RDAP networking, passes the actual `-rdap` flag, and persists core history.
- The root Docker image packages web assets but Go does not serve them. The website still needs Vite locally or a separately configured production static server. No containerized website is claimed.
- Redis, Prometheus, and Grafana are optional infrastructure, not implemented core caching or telemetry. `/metrics` is not implemented. Optional Grafana retains a demo default password: change it before any real use. Do not publish optional services.
- Kubernetes templates are unverified and still need redesign: separate RDAP deployment conflicts with the loopback contract, environment variables are unused, service accounts/images are placeholders, metrics are not implemented, and `emptyDir` history is not durable or shared across replicas.
- Extension and Android behavior/builds are not verified by this backend work. Website visual behavior, including any reported black screen, must be checked independently.

## Verified in this local backend pass

`make test-go test-java` passed, including registry redirect/base-validation regressions and Java parser checks. `sh -n scripts/dev.sh` and `docker compose config --quiet` passed. Stack started via `scripts/dev.sh` after all three ports were free. Core health reported RDAP `ok`, registry health returned `ok`, website responded HTTP 200, and the local private-address request returned the sanitized HTTP 400 refusal. No external target scan, publishing, or commit was performed.
