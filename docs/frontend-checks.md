# Frontend workflow runtime checks

Verified locally on 25 October 2026. This handoff covers only the new
`apps/web/src/workflows.test.tsx`; existing application source and other tests
were not edited by this worker.

## Commands and observed results

Run from `apps/web`:

```sh
npx vitest run src/workflows.test.tsx
npm run build
```

- Targeted runtime tests: **11 passed**, one test file passed.
- Independent production validation: **passed** (`tsc --noEmit` and Vite build).
- The test run emits Motion's reduced-motion notice; it is not a test failure.

## Coverage

| Workflow | Observed assertion |
| --- | --- |
| Compare duplicate origins | Distinct paths on the same origin fail local validation; fetch is not called. |
| Compare private URLs | Loopback IPv4, cloud-metadata/link-local, and IPv4-mapped loopback IPv6 reject the entire batch without fetch. |
| Compare partial failure | A successful result remains visible alongside the sibling's HTTP 429 failure; controls become usable again. Both assessment requests contain only origins and omit credentials. |
| History filters | Actual `high_risk` wire verdict selects both high-risk fixtures, excludes an unknown verdict even with a high advisory score, combines trimmed case-insensitive domain search, and clears filters without another request. |
| Clear cancellation | Opening confirmation and cancelling sends no DELETE, keeps loaded records, and preserves browser-local case notes. |
| Case workspace | Analyst notes save to local storage without fetch; Recheck passes only the stored assessment origin to its callback. |
| Batch workspace | Duplicate origins collapse locally and path/query/fragment are stripped before the real API wrapper sends a request. |
| Watch workspace | Add strips path/query/fragment; duplicate and private inputs are rejected; origin-only storage survives remounts; Recheck uses the origin; removal persists across remounts without fetch. |
| Legacy watch page | Reads the same browser-local watch key, passes only the origin to Check, and removes the origin locally. |

## Test boundary and fixtures

Tests mount real components through React DOM `createRoot` in jsdom, under
MemoryRouter and reduced-motion MotionConfig. They dispatch native input events
and click actual rendered controls. No application component, API module,
validation helper, or watch storage module is mocked.

All fixtures are explicitly labelled contract fixtures in the test file. They
use reserved `.invalid` origins, deliberately selected wire verdicts/scores, and
fixture-only descriptions. They are not product data, actual collector results,
measured detection performance, or evidence of a site's safety.

Global fetch is replaced in every test, including no-network assertions. The
stub routes return explicit JSON contracts. Unexpected requests reject. No
third-party host, real checker, or real history store is contacted or deleted.

## Dependencies and team handoff

React DOM and Vitest already existed. jsdom was absent from the web package, so
this worker ran:

```sh
npm install --no-save --package-lock=false jsdom
```

No package manifest or lockfile changes were made. This is a local dependency
setup, **not reproducible from the checked-in lockfile alone**: the lead should
add jsdom as a dev dependency in a separately owned manifest change if these
tests are to run in fresh checkout/CI. The installation reported 37 added and
16 changed node_modules packages, so it was not an immutable install.

On Node 26, Vitest 3's jsdom environment initially retained Node's undefined
global localStorage. The test harness binds the actual jsdom Storage instance
via its internal `_localStorage` property. This compatibility bridge is confined
to tests but couples the harness to jsdom internals; revisit it when upgrading
Vitest/jsdom. No synthetic storage implementation is used. React `act` polling
is serial to prevent overlapping asynchronous act calls.

Compare's partial-failure region is `[role="status"]` with heading
“Origins not completed”; successful results use `.compare-results-section`.
Initial failures from incorrect test selectors were fixed, and the repaired
check passed. **No application defect was established by these tests.**

The shared team notes were read first, but this worker owns only the two new
files named above. Coordination facts are recorded here rather than modifying
the existing `docs/team-notes.md`; the lead can incorporate this handoff.

## Not verified by this worker

- Live checker/registry behavior, collector correctness, or real-network scans.
- Browser screenshots, visual design, responsive layout, or production browser
  accessibility. Browser was intentionally left to the lead's QA session.
- Entire repository test suite or fresh-checkout/CI dependency resolution.
- Application root route navigation end-to-end; App and route wiring were read,
  but workflow controls were mounted directly for isolated runtime assertions.

The broader direction to scale the worker team and present the upgraded website
remained with the lead. This worker continued only the assigned frontend QA
scope. No commits or application-source edits were made.
