# Backend verification handoff

## Verified local changes

- Kept the public Go/JSON assessment schema unchanged. Fixed stale test references: `Assessment.Registrable` serializes as `registrableDomain`; `Registration` has no registrable field.
- Assessment shape tests now use reserved `example.invalid`, avoiding public website scans.
- The Go registry client refuses HTTP redirects and requires a loopback HTTP origin without credentials, path (except `/`), query, or fragment.
- Added regression tests in `services/core/internal/collect/rdap_test.go`. Both failed before the fix and passed afterward.
- `go test ./internal/collect -run TestRegistry` and `make test-go test-java` passed locally. Java parser checks passed. Loopback server tests required execution outside the OS sandbox with permission.

## Remaining work (not verified or fixed)

- No local stack was started; ports 5173/8080/8082 were free at the initial inspection.
- Docker has no reachable daemon here. Docker images and Compose were not built or run.
- Both core Dockerfiles use shell RUN commands in distroless stages and an unsupported `-health` flag. The root Dockerfile copies UI assets but core does not serve them.
- Compose supplies ignored RDAP_BASE/REDIS_ADDR environment variables, and points to a separate RDAP container although the Go registry accepts loopback only and Java binds loopback only. Preserve that boundary when fixing deployment.
- Kubernetes templates retain separate loopback-bound RDAP, unused environment wiring, unimplemented metrics annotations, placeholder images and service accounts; not a verified production deployment.
- No SIH demo guide was created before the task was interrupted. No frontend changes, commit, publish, or external scan was performed by this helper.

## Workspace component handoff (21 October 2026)

- New `apps/web/src/CaseWorkspace.tsx` exports named `CaseWorkspace`, `WatchWorkspace`, and `BatchWorkspace`; their prop types are exported. CSS is imported by the component module. Main shell integration remains with the lead.
- Cases use browser-local metadata under `websentinel.cases.v1`, keyed by assessment id; statuses are open/reviewed/escalated. JSON/CSV/text exports include notes. CSV fields neutralize formula prefixes.
- Batch uses `prepare` for origin-only deduplication, max 10; calls real `assess(origin, signal)` sequentially, with cancel and unmount abort. `onComplete()` fires on completed/cancelled runs while mounted, so the shell should refresh history there.
- `npm test -- --run src/workspaceData.test.ts`: 12/12 passed. Scoped strict TypeScript check passed. Full build failed in legacy About/compare/history/particles files; do not attribute that failure to these workspace files.
- Corrected in-memory QA harness rendered at `http://127.0.0.1:5201/workspace-qa`; mobile DOM inspection at 390px found no overflow, small targets, or contrast failures. Screenshots were saved but vision was unavailable, so appearance is not independently verified.
- Batch browser interaction showed real sequential checking/queued states and then 0 completed/2 failed, with honest per-row errors because the local checker was unavailable. No successful assessment or synthetic result is claimed. Notes/comparison populated-history browser interactions and cancellation completion remain unverified.
- Earlier main-app blank-screen diagnostic: missing `GitHub` export from lucide-react in legacy About.tsx. Lead owns the shell/legacy fixes. Website-first direction retained; no other client work was done by this helper.

## History integration (history.tsx owner)

- Integrated existing `CaseWorkspace` and `BatchWorkspace` into `HistoryPage`; workspaces receive the loaded assessments independently of timeline filters. `onOpen` resets timeline search/filter and focuses the full report; refresh and batch completion reload history.
- All motion variant constants explicitly use `Variants`; timestamps use `toLocaleString` with hour/minute; backend `high_risk` maps through `riskLevel` before filtering. Visible Safe labels now read Low observed risk.
- Recheck uses `recheckOrigin({ origin })` from `ScanPreview` and `navigate('/', { state: { origin } })`; no query-string or full-URL route state. Report recheck only prepares the input; it does not automatically scan.
- Clear requires explicit Confirm deletion, guards duplicate clicks, disables confirm/cancel while pending, preserves visible records on failure, reports errors, and reloads on success. Successful DELETE empties the local snapshot before reload. Browser-local case notes are not deleted. No real history was cleared in QA.
- Initial checks: `npx tsc --noEmit` reported no history.tsx errors but failed in concurrent About.tsx, App.tsx, compare.tsx work. `npx vitest run`: 67 passed, 2 failures in scanApi.test.ts (offline message expected “Start the local services”; already-aborted fetch still invoked). API owner should address these.
- Browser initially rendered `/history`, actionable Retry loading history, and Batch assessment. Live history returned HTTP 500. Fixture injection was blocked by the browser input boundary, so no mock mutation was run; subsequent concurrent main.tsx updates produced a temporarily blank page. Full history/filter/clear interaction QA remains pending until backend/dev entry settles.

### History final verification update

- Read backend score implementation: wire verdicts remain `safe`, `suspicious`, `high_risk`. Unknown verdicts now render neutral `Unclassified` and are excluded from the high-risk filter, rather than falling through as high risk. No backend verdict names were changed.
- Executed 12 assertions directly against the transpiled history helper code: actual backend verdict mapping/filter counts, low/unknown labels, older-record date and time, invalid date guard, and date grouping all passed. No files, network calls, or history mutations from this check.
- `Verify check` still reports no history TypeScript errors; remaining compile errors at that check are `compare.tsx` lines 472/734/735 (comparison interface drift). Full Vitest remains 67/69 passing with the two scanner API failures described above.
- Current `http://127.0.0.1:5173/history` returns HTML but Chromium cannot render the app because `/src/main.tsx?...` returns 500 during other agents' edits. Earlier browser observation confirmed the history load-error/retry control and integrated batch section. Loaded-case, clear-failure/in-flight, and workspace-report interactions are not browser-verified. Attempted isolated fetch mocking was denied before execution; no QA clear or mock assessment was sent.
- Clear-failure UI now also offers `Reload history` to reconcile records before retry. After an acknowledged successful clear, local displayed records become empty before refresh so a failing reload does not resurrect stale records.

### History recheck after reminder

- Reran helper assertions: 12/12 pass using actual backend `safe`, not the unsupported `low_observed_risk` fixture in the initial failed check.
- Latest `npx tsc --noEmit`: no history errors; now blocked by `About.tsx:3` importing unavailable `Github` and `App.tsx:395` passing two arguments to one-argument `healthLabel`. Earlier compare errors no longer appeared.
- Latest Vitest: 67/69 pass. `scanApi.test.ts:31` expects wording `Start the local services`, but api.ts emits `Run ./scripts/dev.sh`; `scanApi.test.ts:36` fails because an already-aborted signal still dispatches fetch. These files belong to the App/api agent and were not edited by history owner.

## Focused scanner API / health-label fix (25 October 2026)

- Changed only owned source files `apps/web/src/api.ts` and `apps/web/src/ScanPreview.tsx`; `App.tsx` retained its existing two-argument call. `healthLabel(health, checking = false)` now prioritizes `Checking local service status…` while a health refresh is pending, preserving one-argument callers and existing offline/ready/degraded labels.
- The request helper rejects an already-aborted caller with its original reason before creating a controller/timer or dispatching fetch. Offline errors now say `Start the local services with ./scripts/dev.sh, then retry.` No URL-transmission, credential, or server-error sanitization boundaries changed.
- `ScanPreview.test.ts` does not exist in the current tree; ran the actual scanner modules: `cd apps/web && npx vitest run src/scanApi.test.ts src/scanOrigin.test.ts` — 42/42 passed. `npm run build` passed (TypeScript and Vite production bundle).
- Direct execution of transpiled `ScanPreview.tsx` passed six health-label assertions: initial checking, checking with a stale ready result, offline, ready, RDAP down, RDAP unknown. The first in-memory harness had an origin-module resolution error; correcting the harness path passed without source changes.
- No browser/end-to-end successful assessment was checked by this focused helper. No other source files, tests, or commits were changed.

## Focused presentation helper (25 October 2026)

- Edited only `apps/web/src/product.css` plus this required handoff. Preserved saved `styles.css`, `main.tsx`, `index.html`, and `About.tsx`. About currently imports supported `Code2`; its React/TypeScript, Go, Java RDAP, Kotlin/extension architecture matches HANDOFF/ADRs. No Redis or invented metrics added.
- Added current workspace selectors absent from legacy CaseWorkspace.css: watch cards/add form, batch editor/preview/progress/status, case rows/details/facts and comparison grid. `.cw-workspace .cw-comparison` owns a single outer column; `.cw-comparegrid` owns side-by-side cards. Legacy comparison `dl` is overridden to prevent misplaced facts.
- At 760px, cards/details stack; at 440px, watch add controls stack and form text is 16px. Long origins wrap, checkbox label/icon/summary targets retain 44px, legacy `.input`/`.btn` receive explicit keyboard rings. Added global CSS reduced-motion handling; main.tsx already has MotionConfig reducedMotion="user".
- `npx vite build` passed: 2377 modules, 1.17s; main JS 445.19 kB (143.26 kB gzip), main CSS 62.08 kB (13.08 kB gzip), About 7.34 kB (2.62 kB gzip). Local build observations only, not runtime/Lighthouse metrics. `npx tsc --noEmit` passed. `npx vitest run src/workspaceData.test.ts`: 12/12 passed.
- In-memory PostCSS assertions confirmed seven actual markup selectors absent before the appended fix and present afterward, plus 440px/reduced-motion/focus/nested-grid contracts. First two harness attempts incorrectly expected prefixed selectors; final corrected harness passed without changing CSS to satisfy it.
- Computed nine palette contrast pairs (ink/muted/dim against base/card/hover): all >=4.5:1; weakest 5.95:1, muted minimum 7.62:1. Not a certification of every rendered state.
- No Browser calls, server startup, external scans, commit, or other-agent source edits. Lead still owns rendered mobile/keyboard QA, loaded watch/case/batch interactions, and runtime performance.

## Additional backend worker — 25 October 2026, live health diagnosis

- Ownership: services/core, services/rdap, scripts, Makefile, docs/backend-readiness.md; no changes to frontend or existing user Makefile/scripts edits. Did not restart/kill any live process or commit. Main agent handles the new six-worker/site-presentation request.
- Actual endpoints: core GET http://127.0.0.1:8080/api/v1/health; Java GET http://127.0.0.1:8082/health. C
[… 1725 more chars, applied to docs/team-notes.md; Read the file for its current text]