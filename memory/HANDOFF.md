# Handoff

Last updated: 18 October 2026.

## What exists

A local three-process checker plus a website, a Chrome extension, and an Android client.

- Website: `http://127.0.0.1:5173` (`apps/web`)
- Checker: `http://127.0.0.1:8080` (`services/core`)
- Registry: `http://127.0.0.1:8082` (`services/rdap`)
- Extension: load `apps/extension` unpacked
- Android: open `apps/android` in Android Studio; emulator uses `10.0.2.2:8080`

Start all local services with `./scripts/dev.sh`.

## Decisions already made

- Origin-only transmission. Path and query are discarded in the client and again in Go.
- Rule score `S` is the paper weights. Advisory index may include extra observations. Verdicts use the advisory index with paper bands (Safe < 24, Suspicious to 59, High risk at 59).
- TLS handshake may read an untrusted leaf; `Valid` is decided by system-root verify.
- RDAP via IANA bootstrap, not WHOIS HTML scraping.
- No trained classifier. No claimed accuracy.

## Do not reopen without a reason

- Binding the API to all interfaces
- Fetching page bodies for classification
- Storing full URLs
- Mixing rule points and extra observations into one undocumented number
- Adding a “scan this internal host” mode

## Open debt

- Rule weights are uncalibrated. `services/core/cmd/eval` is the protocol, not a result.
- Android project is source-complete; it has not been built here because the Android SDK is not installed on this machine.
- DNS-rebinding defense is resolve-then-dial plus Control hook. Keep those two together.
