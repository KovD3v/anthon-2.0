# Task 9 — hardening interactive routine beta

## Outcome

The vertical routine/chat/API unit suite found roadmap-carried fixture drift and no production behavior regression. The archive-route response has included `formatVersion` since the v1/v2 contract; all affected hydration/route test fixtures now explicitly expect `formatVersion: 1` (`200f959`).

No feature-contract change was needed, so `docs/superpowers/specs/2026-08-08-interactive-routine-roadmap-design.md` was not altered.

## RED → GREEN

- **RED:** routine hydration and archive response expectations failed because their expected cards omitted `formatVersion`, while the authoritative response returned `formatVersion: 1`.
- **GREEN:** updated only the affected v1 fixtures and expectations. The complete scoped suite and full unit suite are green.

## Verification

| Check | Result |
| --- | --- |
| `bunx vitest run src/lib/coaching src/app/api/coaching 'src/app/(chat)/components' 'src/app/(chat)/chat'` | passed: 35 files, 353 tests |
| `bun run test` | passed: 203 files, 1,929 tests (4 skipped) |
| Model/tier/persistence smoke: `routine-model-contract`, routine proposal, web/guest channel, persistence tests | passed: 3 files, 19 tests (the repository has no separate matching channel unit files for the two supplied paths) |
| `bun run typecheck` | passed |
| `bunx prisma validate` | passed |
| `bun run build` | passed; production compile and TypeScript completed |
| `git diff --check` | passed |
| Next dev MCP `get_compilation_issues` | `{ "issues": [] }` |
| `bun run test:integration` | not run: `NEON_API_KEY`, `NEON_PROJECT_ID`, and development `DATABASE_URL` are absent |
| `bun run lint` | blocked by pre-existing `.impeccable/hook.cache.json` formatting, outside feature scope |

## Runtime verification limitations

`next dev` and its MCP endpoint were available; route compilation was clean. T3 preview verified the guest landing and conversation at 390px and 1280px, including opening/closing the mobile sidebar and focus return to its trigger. Authenticated routine creation, keyboard/focus across all flows, reduced-motion, timer-background, and visual touch-target passes were **not fully browser-verified** because no authenticated browser data was available. No authenticated browser verification is claimed.

The build invoked the configured PostHog source-map upload. It succeeded, with pre-existing warnings about empty server source maps; these warnings did not affect compilation.

## Scope audit

- Changed only `src/app/api/coaching/routines/[routineId]/route.test.ts`, `src/lib/chat.test.ts`, and this Task 9 report across the hardening/final-fixture commits.
- Preserved and did not stage `docs/user-plan-states.md` and `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`.

## Final review remediation — 2026-08-09

All six findings against `5a44bea..e060e4b` were confirmed and addressed.

- **v2 persistence:** `POST /api/coaching/routines` now writes `formatVersion: 2` for a validated v2 snapshot and explicit `1` for legacy v1. The RED test asserted the Prisma create payload/readback for structured v2 steps; it failed before the persisted field and passes after it. Prisma still defaults the field to `1`, so this removes the v2 corruption path. No database credentials are configured in this workspace, so no production/development inconsistent-record count or cleanup was attempted.
- **Out-of-page source hydration:** authenticated clients resolve a routine by `id + userId` through an owner-scoped GET only when it is absent from current chat data and the active-routine cache. They then request the already owner-verified source message for the source chat. RED tests cover a second active routine and an archived routine outside the loaded page; both hydrate their exact source and only the active pending record opens check-in. Guests receive no resolution route access.
- **History refresh:** an open `RoutineHistory` reloads when `latestAttempt` changes; its RED rerender test now displays the newly recorded outcome.
- **Breathing live region:** phase/cycle changes announce `Inspira`, `Pausa`, and `Espira` exactly once per phase/cycle key, without timer-tick repetition.
- **Proposal analytics:** `routine_proposed` is session-idempotent by source message id, including remount/history revisit.
- **Shelf controls:** compact/expanded/retry controls now preserve at least `min-h-11 min-w-11`; regression tests assert the touch-target classes.

### RED -> GREEN evidence

| Check | Result |
| --- | --- |
| Initial focused RED suite | failed as expected: missing v1 expected create field, old archived hydration assertion, and new out-of-page lookup mismatch before fallback adjustment |
| `bunx vitest run src/app/api/coaching/routines/route.test.ts 'src/app/api/coaching/routines/[routineId]/route.test.ts' 'src/app/(chat)/components/RoutineHistory.test.tsx' 'src/app/(chat)/components/RoutineRunner.test.tsx' 'src/app/(chat)/components/RoutineCard.test.tsx' 'src/app/(chat)/components/RoutineSidebarShelf.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'` | passed: 7 files, 129 tests |
| `bun run test` | passed: 203 files, 1 skipped; 1,935 tests, 4 skipped |
| `bun run typecheck` | passed |
| `bunx biome check` on the 14 changed source/test files | passed |
| `bunx prisma validate` | passed |
| `git diff --check` | passed |
| `bun run lint` | still blocked solely by pre-existing `.impeccable/hook.cache.json` formatting, outside scope |

No schema migration is required for this write-path fix. Integration readback and a data cleanup audit remain unavailable because `NEON_API_KEY`, `NEON_PROJECT_ID`, and a development `DATABASE_URL` are absent.

## Re-review race-condition remediation — 2026-08-09

Three additional findings were confirmed and fixed with RED-to-GREEN tests.

- **History stale requests:** a change to `latestAttempt` now starts a replacement request even if the preceding page is still pending. Each request carries an incrementing sequence and a `routine.id:latestAttemptKey` identity; stale successes and stale failures are ignored, and only the current request may clear loading state.
- **Query A-to-B switch:** the resolved lookup state now stores the requested ID with the routine and is cleared before a new lookup. Source hydration therefore cannot pair a prior routine source with a newer `checkInRoutineId`.
- **Pagination touch target:** `Carica altre routine` now has `min-h-11 min-w-11` in both active and archived modes.

| Check | Result |
| --- | --- |
| RED: new history race, query-switch, and pagination target tests | failed as expected: 1 request instead of 2; invalid `routine-b`/`assistant-a` hydration; missing `min-h-11` |
| focused three-file suite | passed: 70 tests |
| `bun run test` | passed: 203 files, 1 skipped; 1,938 tests, 4 skipped |
| `bun run typecheck` | passed |
| scoped Biome (six affected files) | passed |
| `git diff --check` | passed |
| `bun run lint` | blocked solely by the pre-existing `.impeccable/hook.cache.json` formatting |
