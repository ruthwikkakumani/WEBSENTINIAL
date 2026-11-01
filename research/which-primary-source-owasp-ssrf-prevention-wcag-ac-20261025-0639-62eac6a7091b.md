# Evidence brief: Which primary-source OWASP SSRF prevention, WCAG accessibility and web.dev performance recommendations apply to a responsive origin-only website risk advisory checker?

2 sources read · 0 facts kept (0 reported by multiple sites; independence unverified, 0 from one site) · 0 refused because their quote was not in the page

## Facts

## Investigation coverage
3 retrieval round(s); stopped: round_limit. Coverage assessment is a proposal, not independent verification.
Remaining evidence gaps:
- Not yet covered: SSRF prevention covering IP validation and redirects
- Not yet covered: Keyboard accessibility and contrast guidance
- Not yet covered: Core Web Vitals thresholds and measured-versus-inferred distinction
- No primary-source OWASP SSRF guidance establishes which controls apply to origin-only inputs, including URL parsing and scheme restrictions, destination allowlisting or validation, private and special-use IP blocking, DNS resolution and rebinding, redirects, and network-layer restrictions.
- No primary-source WCAG guidance identifies applicable accessibility requirements for the responsive checker’s inputs, validation errors, advisory results, keyboard interaction, focus visibility, contrast, reflow, or assistive-technology announcements.
- No primary-source web.dev guidance identifies applicable performance recommendations or current measurement targets for responsive loading, rendering, interaction responsiveness, and layout stability.
- The checker’s architecture is unspecified: whether it makes server-side requests, follows redirects, resolves DNS, or only evaluates an origin locally. This prevents determining which SSRF recommendations apply.
- The provided Wikipedia sources contain no extracted facts and do not establish current OWASP, WCAG, or web.dev recommendations; the available date metadata does not demonstrate freshness.

## Sources
- **S1** Computer accessibility - Wikipedia — https://en.wikipedia.org/wiki/Computer_accessibility (wikipedia.org, published 2003-12-23; credibility 0.51; read 2026-10-25 06:40; nothing relevant)
- **S2** Accessibility - Wikipedia — https://en.wikipedia.org/wiki/Accessibility (wikipedia.org, undated; credibility 0.51; read 2026-10-25 06:40; nothing relevant)

## Provenance
Exact page text read for every web source is snapshotted with its SHA-256 in which-primary-source-owasp-ssrf-prevention-wcag-ac-20261025-0639-62eac6a7091b.evidence.jsonl; `audit` re-checks every quote against it offline and `recheck` compares it with the live page.

## Verification scope
Quotes were located in retrieved text. Source independence and claim entailment were not independently verified.

## Labels
- CORROBORATED: two or more sites state it; quotes were located, but source independence and semantic support are not independently verified
- EXTERNAL: one site states it (exact quote found)
- USER-PROVIDED: the user's own files state it
- STALE: every source is older than the freshness this question needs
- INFERRED: reasoning from the facts above — the answer must say it is an inference
- GENERATED: made by PHRONEN (a draft, an example, a design) — not a fact about the world
- UNKNOWN: no source was found — the answer must say it is not known
