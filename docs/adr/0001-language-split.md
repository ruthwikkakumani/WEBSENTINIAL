# ADR 0001 — Split the work by what may touch the network

Status: accepted

The browser explains. Go is the only process that may connect to the assessed host. Java talks to public RDAP with a domain name, never a URL. Kotlin repeats the origin-only client on Android.

Why: a URL-fetching service is a confused deputy. Isolating the fetch, the registry lookup, and the UI makes the SSRF boundary reviewable. Mixing them in one Node process is how the original prototype left private-address denial unfinished.
