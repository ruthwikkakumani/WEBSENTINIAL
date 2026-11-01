# WebSentinel — API Reference

> **Base URL:** `https://api.websentinel.io` (production) or `http://127.0.0.1:8080` (development)  
> **Content-Type:** `application/json`  
> **Version:** v1 (2026-10-19)

---

## Table of Contents

1. [GET /api/v1/health](#1-get-apiv1health)
2. [POST /api/v1/assess](#2-post-apiv1assess)
3. [GET /api/v1/history](#3-get-apiv1history)
4. [DELETE /api/v1/history](#4-delete-apiv1history)
5. [Error Codes](#5-error-codes)
6. [Rate Limits](#6-rate-limits)
7. [Example Workflows](#7-example-workflows)

---

## 1. GET /api/v1/health

Returns the service health status.

### Request

```
GET /api/v1/health
Host: api.websentinel.io
Accept: application/json
```

### Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "version": "1.0.0",
  "uptime": "14d 3h 22m",
  "rdap": "connected",
  "historyCount": 1842
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | `"ok"` when healthy |
| `version` | string | Semantic version |
| `uptime` | string | Human-readable uptime |
| `rdap` | string | RDAP backend status: `"connected"`, `"unreachable"` |
| `historyCount` | integer | Number of stored assessments |

### Status codes

| Code | Meaning |
|---|---|
| 200 | Service healthy |
| 503 | Service unhealthy (RDAP down, history unreadable) |

---

## 2. POST /api/v1/assess

Submit a URL for assessment. This is the primary endpoint.

### Request

```
POST /api/v1/assess
Host: api.websentinel.io
Content-Type: application/json

{
  "url": "https://login-paypal-secure.example.com/login"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The URL to assess. Must include scheme. |

### Request validation rules

- `url` must be a valid URL with a scheme (`http://` or `https://`).
- Maximum URL length: 2048 bytes.
- URL must not contain `userinfo` (credentials in URL).
- URL must not point to a private, loopback, link-local, or cloud metadata address.
- URL hostname must be a valid domain name or public IP.
- Rate-limited per client IP (see [Rate Limits](#6-rate-limits)).

### Response (200 — Assessment complete)

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "WS-40B68E88",
  "assessedAt": "2026-10-19T05:07:00.030855Z",
  "origin": "https://login-paypal-secure.example.com",
  "scheme": "https",
  "hostname": "login-paypal-secure.example.com",
  "registrableDomain": "example.com",
  "discardedPath": true,
  "connectedTo": "198.51.100.23",
  "ruleScore": 12,
  "advisoryScore": 22,
  "verdict": "suspicious",
  "verdictLabel": "Suspicious",
  "summary": "Some public signals deserve a second look before you enter any information. Read the reasons below and decide with them, not with the number alone.",
  "findings": [
    {
      "id": "brand_lookalike",
      "signal": "Hostname",
      "severity": "risk",
      "weight": 12,
      "rule": false,
      "title": "A familiar brand word is not the registered domain",
      "detail": "The hostname contains PayPal, but the registered domain is example.com. Words on the left of a domain are chosen by whoever registered the name on the right.",
      "evidence": "paypal"
    },
    {
      "id": "scheme",
      "signal": "TLS",
      "severity": "info",
      "weight": 0,
      "rule": true,
      "title": "The page loads over HTTPS",
      "detail": "HTTPS encrypts data in transit but does not guarantee the identity of the server. The rest of the assessment checks the site, not the encryption.",
      "evidence": "https"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Assessment ID (`WS-` + 8 hex chars) |
| `assessedAt` | string | ISO 8601 UTC timestamp |
| `origin` | string | `scheme://hostname` (path stripped) |
| `scheme` | string | `"http"` or `"https"` |
| `hostname` | string | The hostname assessed |
| `registrableDomain` | string | Public suffix + one label |
| `discardedPath` | bool | True when the submitted URL had a path/query |
| `connectedTo` | string | IP address connected to (or empty) |
| `ruleScore` | integer | Documented rule score (0–100) |
| `advisoryScore` | integer | Advisory score including extra observations (uncalibrated, 0+) |
| `verdict` | string | Verdict band: `"safe"`, `"suspicious"`, `"high_risk"` |
| `verdictLabel` | string | Capitalised label for UI display |
| `summary` | string | Human-readable summary |
| `findings` | array | Ordered list of observations (see Finding object) |

### Finding object

| Field | Type | Description |
|---|---|---|
| `id` | string | Machine-readable finding identifier |
| `signal` | string | Category: `"TLS"`, `"Hostname"`, `"Registration"`, `"Page"`, `"DNS"`, `"Redirects"` |
| `severity` | string | `"risk"`, `"caution"`, `"info"` |
| `weight` | integer | Point contribution (positive = warning, negative = reducing, zero = info) |
| `rule` | bool | True when part of the documented rule set |
| `title` | string | Short human-readable title |
| `detail` | string | Explanation with caveats |
| `evidence` | string | Supporting evidence (never includes raw URL) |

### Response (400 — Bad request)

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "bad_request",
  "message": "URL must include a scheme (http:// or https://)."
}
```

### Response (429 — Rate limited)

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{
  "error": "rate_limited",
  "message": "Try again later."
}
```

---

## 3. GET /api/v1/history

Retrieve recent assessment results.

### Request

```
GET /api/v1/history?limit=10
Host: api.websentinel.io
Accept: application/json
```

| Query parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 20 | Maximum number of records to return (max 100) |

### Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "count": 10,
  "items": [
    {
      "id": "WS-40B68E88",
      "assessedAt": "2026-10-19T05:07:00.030855Z",
      "origin": "https://example.com",
      "verdict": "safe",
      "verdictLabel": "Safe",
      "ruleScore": 0,
      "advisoryScore": 0,
      "summary": "The documented rules did not cross the caution line. That is not a guarantee the site is legitimate, and a valid certificate does not prove identity."
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `count` | integer | Number of items returned |
| `items` | array | Array of assessment summaries |

Each item is a subset of the full assessment (findings omitted for brevity). Use the `id` to correlate with a full assessment if needed.

### Status codes

| Code | Meaning |
|---|---|
| 200 | History returned (may be empty array) |
| 500 | History file unreadable |

---

## 4. DELETE /api/v1/history

Clear all stored assessments.

### Request

```
DELETE /api/v1/history
Host: api.websentinel.io
Accept: application/json
```

### Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "deleted"
}
```

### Status codes

| Code | Meaning |
|---|---|
| 200 | History cleared |
| 500 | Failed to clear history |

---

## 5. Error Codes

All error responses follow this format:

```json
{
  "error": "error_code",
  "message": "Human-readable explanation."
}
```

| Error code | HTTP status | Description |
|---|---|---|
| `bad_request` | 400 | Malformed JSON or missing/invalid `url` field |
| `no_scheme` | 400 | URL missing `http://` or `https://` |
| `bad_url` | 400 | URL could not be parsed |
| `private_address` | 400 | URL resolves to or contains a private/non-public address |
| `credentials_in_url` | 400 | URL contains `userinfo` (credentials are a phishing indicator) |
| `invalid_hostname` | 400 | Hostname is not valid |
| `rate_limited` | 429 | Client exceeds rate limit |
| `service_unavailable` | 503 | Backend collector (RDAP) unreachable or too many concurrent requests |
| `internal_error` | 500 | Unexpected server error |
| `timeout` | 504 | Assessment exceeded time limit (30s) |

### Error message safety

Error messages **never** include:
- The original URL or any part of it
- Internal IP addresses or hostnames
- Stack traces or debug information
- File paths from the server

---

## 6. Rate Limits

### Per-client limits

| Parameter | Value |
|---|---|
| Algorithm | Token bucket (per hashed client IP) |
| Capacity | 20 tokens |
| Refill rate | 1 token/second |
| Burst | 60 tokens |
| Key | SHA-256(client IP) |

### Caching

The same `origin` assessed within 60 seconds returns the cached result without consuming a token.

### Concurrency

| Parameter | Value |
|---|---|
| Max concurrent assessments | 8 |
| Queue timeout | 15 seconds |
| Assessment timeout | 30 seconds |

### Rate limit headers

All responses include:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1718726400
```

---

## 7. Example Workflows

### 7.1 Assess a URL

```bash
curl -s -X POST https://api.websentinel.io/api/v1/assess \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/login"}' | jq .
```

### 7.2 Check service health

```bash
curl -s https://api.websentinel.io/api/v1/health | jq .
```

### 7.3 View assessment history

```bash
curl -s "https://api.websentinel.io/api/v1/history?limit=5" | jq .
```

### 7.4 Clear history

```bash
curl -s -X DELETE https://api.websentinel.io/api/v1/history | jq .
```

### 7.5 Handle rate limiting

```bash
response=$(curl -s -w "%{http_code}" -o /tmp/ws-response.json \
  -X POST https://api.websentinel.io/api/v1/assess \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')

if [ "$response" = "429" ]; then
  retry_after=$(jq -r '.retryAfter // 30' /tmp/ws-response.json)
  echo "Rate limited. Waiting ${retry_after}s..."
  sleep "$retry_after"
  # retry
fi
```