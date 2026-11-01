# Backend readiness — 25 October 2026

## Current result — successful recheck

The lead reports relaunching the Java and Go services from current source with localhost networking permitted. This helper independently rechecked the resulting endpoints and reran the complete suite; it did not restart services or change source during this follow-up.

`make test` **passed**: Go packages, freshly compiled Java parser/privacy tests, **100/100 web tests** across nine files, and all three existing evaluation fixtures. The frontend failure recorded below is superseded by this successful full-suite run. The lead reports correcting the workflow selector and saving the jsdom development dependency; this helper did not edit or independently inspect those frontend changes.

Current observed responses:

| Probe | Response |
| --- | --- |
| `http://127.0.0.1:8080/api/v1/health` | `{"bind":"127.0.0.1","rdap":"ok","status":"ok","version":"1.0.0"}` |
| `http://127.0.0.1:5173/api/v1/health` | `{"bind":"127.0.0.1","rdap":"ok","status":"ok","version":"1.0.0"}` |
| `http://127.0.0.1:8082/health` | `{"service":"rdap","status":"ok"}` |

The current local stack is ready at the test and health-endpoint level. This is not a visual website review, production-readiness certification, or a detection-accuracy claim. No public target was assessed.

Recheck command, run with filesystem sandboxing retained and `network=true` for localhost test sockets:

```sh
make test
curl --max-time 5 -sS http://127.0.0.1:8080/api/v1/health
curl --max-time 5 -sS http://127.0.0.1:5173/api/v1/health
curl --max-time 5 -sS http://127.0.0.1:8082/health
```

The earlier retained verification command was cancelled and therefore was not a passing check. On resumption, verification status contained no declarations. The successful fresh command above, plus fresh endpoint observations, supersede that incomplete attempt. Non-failing frontend warnings about Node localStorage and reduced-motion settings were printed; all tests completed successfully.

## Earlier live diagnosis — superseded snapshot

Initially observed without this helper restarting, killing, or reconfiguring the existing services:

| Probe | Result |
| --- | --- |
| `curl --max-time 5 -sS http://127.0.0.1:8080/api/v1/health` | `{"bind":"127.0.0.1","rdap":"down","status":"ok","version":"1.0.0"}` |
| `curl --max-time 5 -sS http://127.0.0.1:8082/health` | `{"service":"rdap","status":"ok"}` |
| `cd services/core && go run ./cmd/rdap-health` | `RDAP health: ok` |

The current Go source uses Java's correct `/health` endpoint. `/health`, `/api/health`, and `/v1/health` are not core health endpoints. The source-level registry probe succeeds against the running Java service, so an endpoint rename is not justified. The existing core's configuration, binary age, or process-specific runtime restrictions remain unresolved: `/bin/ps` was denied by the sandbox, so its actual arguments and start time could not be inspected. A listening Java socket alone is not used as proof of readiness.

At that initial observation the live core reported RDAP down, so stack-health claims were not justified. This limitation is superseded by the successful current recheck above. The new probe runs as a one-shot command; it does not start a server or look up a domain.

## Source fixes

- `services/core/internal/collect/rdap.go`: add `Registry.Health`, using the existing registry-origin validation: loopback HTTP only, no credentials/query/fragment/nested path. No proxy or redirect following; 700 ms deadline; bounded JSON decode; require HTTP 200 with `service: rdap` and `status: ok`.
- `services/core/internal/httpapi/server.go`: use that guarded probe instead of a separate unrestricted health client. Keep the browser-facing health JSON schema unchanged. A redirect, another service's 200, malformed body, or unavailable registry stays down.
- `services/core/internal/httpapi/server_test.go`: test healthy/down API reporting, wrong service, malformed/empty/oversized health bodies, non-200 response, forbidden base configuration, and zero requests to a redirect destination.
- `services/core/cmd/rdap-health/main.go`: a reproducible one-shot source-level health probe with optional `-rdap` loopback origin. It fails nonzero rather than faking health.
- `services/rdap/src/sentinel/Main.java`: validate domain-only input before lookup and before the request log, returning a generic HTTP 400 for URL/credential/path/query/fragment input. Rejected raw material previously reached the log.
- `services/rdap/src/sentinel/MainTest.java` and `ParseTest.java`: a temporary loopback HTTP server checks invalid requests receive 400 and leak no submitted material into responses or logs. The test stops only its own ephemeral server and performs no external registry lookup.

Existing Makefile, startup-script, scoring, and registry-fetch changes were preserved, not replaced. No commit was made. No existing service was restarted or killed. All network work was localhost-only; no website attack, credential scan, or public RDAP lookup was performed.

## Checks run

Passed:

```sh
cd services/core && go test -count=1 ./...
cd services/core && go test -count=1 ./internal/httpapi ./internal/collect
cd services/core && go test -race -count=1 ./...
make test-java test-eval
git diff --check -- services/core services/rdap scripts Makefile docs/backend-readiness.md
cd services/core && go run ./cmd/rdap-health
```

`make test-java` recompiles all Java sources with `javac --release 21` before running `sentinel.ParseTest`; the privacy HTTP test is included. Evaluation checked the three existing fixtures; it is not a measured detection-rate claim.

The initial `make test` attempt passed Go and Java, but the web suite stopped on the concurrently edited `src/workflows.test.tsx` test “keeps a successful sibling when another origin fails and transmits origins only” because `.compare-errors` was missing. At that observation, 99/100 web tests passed. This was outside this backend worker's file ownership and was reported to the lead in `docs/team-notes.md`; evaluation was subsequently run separately and passed. **The fresh full-suite recheck above now supersedes this failure: 100/100 web tests and the complete `make test` target pass.**

The first focused Go run hit `connect: operation not permitted` for an ephemeral localhost test connection. Filesystem sandboxing stayed enabled and the retry enabled networking for localhost test sockets; it passed. `sandbox=false` was not used because unsandboxed execution is disabled in the environment. No dependencies were downloaded.

## Lead-managed startup reference — restart requirement resolved

The lead reports completing the current-source Java/core relaunch, and the fresh health checks above confirm the resulting stack is healthy. No further restart is required by this report. The commands below are retained as a future startup reference; this helper did not execute them:

```sh
# From the project root; replace/relaunch existing listeners only under lead control.
javac --release 21 -d services/rdap/build services/rdap/src/sentinel/*.java
java -cp services/rdap/build sentinel.Main 8082

# In a separate terminal from services/core:
go run ./cmd/sentinel -addr 127.0.0.1:8080 -rdap http://127.0.0.1:8082 -data ../../data/history.json
```

Use an execution context permitted to make localhost connections. Restarting Java is necessary to load the new rejection-before-logging behavior; recompiling its classes does not update the currently running JVM. Restarting the core is necessary to load the guarded health probe. The existing `scripts/dev.sh` checks that ports 5173, 8080, and 8082 are free before starting anything; do not run it over active listeners.

After relaunch, require both the one-shot registry probe and `GET /api/v1/health` to report RDAP `ok`. If the one-shot probe is healthy but the live core remains down, inspect the core launch configuration/runtime permissions rather than changing the UI or forcing the health field.

The request to coordinate up to six workers and show the website is handled by the lead. This worker stayed on the delegated backend scope and shared findings in the team notes. The later pasted-text marker contains no actual pasted content in this helper's context, so no additional backend change was inferred from it.
