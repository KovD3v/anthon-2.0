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
