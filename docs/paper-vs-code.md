# Reverse reading of the paper against this code

This is a source inspection of our own design versus the WebSentinel paper. It is not an attack on any site.

| Paper claim | Prototype in the paper | This repository |
|---|---|---|
| Chrome popup, origin only | Implemented | Website + extension + Android; origin only |
| Express `/check` | Implemented | Go `POST /api/v1/assess` |
| HTTPS / TLS / WHOIS age | WHOIS HTML scrape | TLS via Go; age via Java RDAP |
| Rule score S | Paper weights | Same weights in `internal/score` |
| Reasons | Rule strings | Rule strings plus extra observations, marked |
| SSRF after DNS | Specified, not built | Resolve, deny private, pin IP, Control hook, redirect re-check |
| RDAP | Empty file | Java IANA bootstrap client |
| React dashboard | Planned | This website |
| PostgreSQL history | Planned | Local JSON, origins only |
| ML / SHAP | Planned, not trained | Not trained. Eval protocol only |
| FastAPI | Planned | Not used; Go owns the fetch |

Gaps that remain as debt, not as features: uncalibrated weights, no labelled campaign, Android unbuilt on this machine, no visual brand matching.
