# Task 8 — routine history, adaptation, and privacy-safe analytics

## Scope and authorization

Implemented the Task 8-owned Prisma, route, client, card/history, and analytics files. The task brief required verified persistence of an adaptation context but omitted the only persistence endpoint. The parent explicitly authorized the narrow addition of `src/app/api/coaching/routines/route.ts` and `route.test.ts` for POST body validation, owner verification, and `derivedFromRoutineId` persistence only.

## RED → GREEN evidence

### RED

- Added GET attempt-history tests for authenticated owner data, guest/non-owner rejection, stable `(attemptedAt DESC, id DESC)` cursor traversal, and owner-only outcome/note data.
- Added integration coverage for owner history data and foreign-owner 404.
- Added adaptation POST tests proving the original routine must be owned by the authenticated user before the relation is persisted.
- Added `RoutineHistory` tests for collapsed-on-load behavior, readable outcome/date/frequency, and append-only older-page loading.
- Added server and client analytics tests for schema validation, exact serialized fields, rejected arbitrary content, and a 14-day aggregate restart event without content.

### GREEN

- `GET /api/coaching/routines/:routineId/attempts` now authenticates, rejects guests, checks ownership before querying attempts, returns `{ attempts, nextCursor }`, and uses an opaque base64url cursor over `attemptedAt` and `id`.
- Existing POST attempt creation and its client action ID idempotency path remain unchanged.
- `Routine.derivedFromRoutineId` is nullable and self-referential; the FK uses `ON DELETE SET NULL`, so deleting an original does not delete its adapted routine.
- Saving a proposed adaptation accepts only a CUID origin and verifies `{ id, userId: authenticatedUser }` server-side. The client retains the selected completed routine ID locally until the adapted assistant proposal is saved; the original routine is not updated.
- `RoutineHistory` is inline and collapsible, displays outcomes/dates/recent frequency, and loads older pages on demand. It includes no streaks, badges, rankings, or AI scoring.
- Analytics event schemas permit only opaque IDs, format version, widget kind, bounded duration, technical state, and a 7/14-day window. No title, trigger, steps, notes, or form answers can serialize.

## Mutation, error, and idempotency evidence

- Attempt POST behavior was preserved: repeated client action IDs return the existing attempt without a second insert or parent update (existing focused regression suite passes).
- History GET performs no mutation; plain refresh does not call attempt creation.
- Malformed history query/cursor returns 400; unauthenticated, guest, and foreign reads return 401/403/404 without reading foreign attempts.
- Missing/foreign adaptation origins return 404 before upsert. Source assistant messages remain owner-and-private-chat scoped.
- `RoutineHistory` preserves already-loaded entries while requesting an older cursor page and retains an error/retry path for failed reads.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260808160000_link_routine_adaptations/migration.sql`
- `src/app/api/coaching/routines/[routineId]/attempts/route.ts`
- `src/app/api/coaching/routines/[routineId]/attempts/route.test.ts`
- `src/app/api/coaching/routines/[routineId]/attempts/route.integration.test.ts`
- `src/lib/coaching/routine-client.ts`
- `src/app/(chat)/components/RoutineHistory.tsx`
- `src/app/(chat)/components/RoutineHistory.test.tsx`
- `src/app/(chat)/components/RoutineCard.tsx`
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- `src/lib/analytics/routines.ts`
- `src/lib/analytics/routines.test.ts`
- `src/lib/coaching/routine-analytics-client.ts`
- `src/lib/coaching/routine-analytics-client.test.ts`
- Authorized narrow extension: `src/app/api/coaching/routines/route.ts`, `src/app/api/coaching/routines/route.test.ts`

## Verification

| Command | Result |
| --- | --- |
| Focused unit/component/migration suite | 8 files, 124 tests passed |
| `bunx prisma validate` | passed |
| `bunx prisma generate` | passed |
| `bun run typecheck` | passed |
| Targeted `bunx biome check` over Task 8 files | passed |
| `git diff --check` | passed |

## Fix round 2 — bind adaptation lineage to the assistant source card

- The submitted adaptation state now records the assistant IDs present before the user sends the exact adaptation prompt. It is not a persistence lineage yet.
- After `onFinish` refreshes chat data, only a newly arrived assistant message carrying `data-coachingRoutine` arms a pair of `{ routineId, sourceAssistantMessageId }`.
- A save receives `derivedFromRoutineId` only when its own assistant message ID exactly matches that pair. Saving an already visible unsaved card while the adapted response is available omits lineage and leaves the pair for the new proposal.
- The conversation regression now proves duplicate titles still bind `routine-2`, an existing `assistant-new` card cannot inherit the relation, and only the new `assistant-adapted` proposal sends the verified derivation. Existing stale/unrelated clearing remains covered.
- Re-ran focused Task 8 suite: 9 files / 153 tests passed; typecheck, targeted Biome, and `git diff --check` passed.
| `bun run build` | passed; Next production compile and TypeScript completed |
| Ephemeral integration tests | not run: `NEON_API_KEY`, `NEON_PROJECT_ID`, and development `DATABASE_URL` are unavailable |
| `prisma migrate diff --from-migrations ... --to-schema ...` | unavailable: repository Prisma config has no `shadowDatabaseUrl`; schema validation/generation and migration SQL test passed instead |

The repository-wide `bun run lint` remains blocked by a pre-existing formatting violation in `.impeccable/hook.cache.json`; the targeted Task 8 Biome check is clean. No unrelated documentation changes were staged.

## Fix round 1 — adaptation binding and restart analytics

### RED → GREEN

- Changed the narrowly authorized `MessageList` callback contract from mutable title-only data to `(routineId, title)` and added a card-render regression proving it passes the clicked persisted ID.
- Added a duplicate-title regression in `ChatConversationClient`: clicking routine `routine-2`, submitting the exact adaptation prompt, and saving the assistant proposal sends only `derivedFromRoutineId: "routine-2"`.
- Added a stale-context regression: changing the prefilled adaptation prompt to an unrelated message before submitting clears the draft, so a later save sends no derivation field.
- Changed the local adaptation lifecycle: the clicked ID is only armed after the exact generated prompt is submitted successfully; every unrelated submit, send failure, and save completion/failure clears the retained context.
- Added `Ripeti routine` after a recorded outcome, while pending attempts remain gated. Card tests prove content-free `routine_restarted_within_14d` events at seven and fourteen days and no such event after fourteen days.

### Fix-round verification

| Command | Result |
| --- | --- |
| Focused Task 8 plus card/message/conversation regressions | 9 files, 153 tests passed |
| `bun run typecheck` | passed |
| Targeted `bunx biome check` over fix files | passed |
| `git diff --check` | passed |
