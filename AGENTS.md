# WebSentinel — how an agent must work here

This file is the harness for anyone continuing the project. It is not marketing copy.

## Instincts

1. A low score is not proof of safety. Never write copy that says a site is legitimate.
2. The scanner is a confused deputy. User-controlled URLs are a request-forgery risk. Do not fetch private, loopback, link-local, or cloud-metadata addresses. Do not add a “just this once” exception.
3. Path, query, fragment, cookies, passwords, and form bodies never leave the browser. Do not add “full URL” logging “for debugging”.
4. Collectors are unauthenticated public clients. No login, no exploit, no credential test, no attack against a third-party site.
5. Do not invent detection rates, latencies, or dataset sizes. If an experiment has not been run, say so.
6. Documented rule weights and extra observations stay in separate numbers.
7. Prefer a short reason a non-expert can act on over another panel of data.

## Languages and jobs

- TypeScript (`apps/web`, `apps/extension`): explain, strip the origin, never contact the target site.
- Go (`services/core`): the only process allowed to contact the assessed host.
- Java (`services/rdap`): domain name in, RDAP record out. Never a URL.
- Kotlin (`apps/android`): the same origin-only check on a phone, against the local checker.

## Before changing behaviour

Read `memory/HANDOFF.md` and the ADRs in `docs/adr`. If you add a collector, add an SSRF re-check and a reason string. If you add a score, mark whether it is a documented rule.

## Tests that must stay green

```
make test
cd apps/web && npx vitest run
```
