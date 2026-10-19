# WebSentinel

WebSentinel is an explainable check for a website address. Paste a link you were sent. It reads public signals and returns a case file: a score, a verdict, and a reason for every point.

A low score is not proof the site is safe. A high score is a request for caution. The weights are design choices. They have not been calibrated on a labelled phishing set, and this project does not report a detection rate.

## How the work is split

The browser page is TypeScript. It strips the address down to an origin before anything is posted, then explains the result.

The checker is Go. It is the only program that contacts the site. It looks at the scheme, the certificate on port 443, DNS, redirects, and the shape of the hostname. Before it dials, it resolves the name and refuses the connection if any address is loopback, private, link-local, carrier-grade NAT, documentation space, or a cloud metadata address. It then connects to the address it just checked, so a later DNS change cannot move the socket.

The registry client is Java. It receives a domain name, never a URL. It uses the IANA RDAP bootstrap, asks that registry for the creation date, and will not follow a redirect onto a non-public host.

## Run it

```sh
./scripts/dev.sh
```

Then open http://127.0.0.1:5173.

The checker listens only on `127.0.0.1:8080`. The registry listens only on `127.0.0.1:8082`. Both stay on this computer.

```sh
make test
```

## What a check uses

Documented rules, in the Go score package:

- not HTTPS, +20
- certificate missing or not verified, +20
- valid certificate expiring in under 7 days, +3
- domain age under 7 days / 30 days / 6 months / 1 year: +35 / +25 / +15 / +8
- registry record updated under 7 days / 30 days: +10 / +6
- HTTPS and DNSSEC signed, −3

Verdicts follow the advisory index: Safe below 24, Suspicious from 24 up to but not including 59, High risk at 59. Extra observations, such as a brand word that is not the registered domain or look-alike letters, can move the advisory index without changing the documented rule total. The page shows both numbers.

## What it will not do

It does not log in, post credentials, run page scripts, or try exploits. It only uses ports 80 and 443. It does not fetch private or metadata addresses. There is no trained classifier and no claimed accuracy.

The Chrome extension in `apps/extension` checks the tab you are looking at and can open the full case file. In Chrome, choose Extensions, enable Developer mode, and load that folder unpacked while the checker is running.

The Android client is `apps/android`. On an emulator it talks to `10.0.2.2:8080`.

Judges: read `docs/hackathon.md`. Agents: read `AGENTS.md` and `memory/HANDOFF.md`. How the fourteen skill repositories were applied: `docs/skills-applied.md`.
