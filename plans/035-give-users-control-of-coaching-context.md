# Plan 035: Give users control of coaching profile and memories

> **Executor instructions**: Follow this plan step by step. Treat all coaching
> context as private user data. Every read and mutation must be scoped to the
> authenticated user, validated, and followed by prompt-cache invalidation.
> Do not expose internal notes, confidence scores, or memory keys. The reviewer
> maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 4f17dd9..HEAD -- prisma/schema.prisma src/lib/ai/tools/memory.ts src/lib/ai/tools/user-context.ts src/lib/maintenance/profile-analyzer.ts 'src/app/(marketing)/profile' src/app/api/preferences`
> If the memory JSON shape, profile ownership, or prompt caches changed,
> reconcile before editing. A schema migration requirement is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4f17dd9`, 2026-07-31

## Why this matters

Anthon automatically extracts profile fields and persistent memories, then
uses them across future conversations and channels. Users can currently ask
the model conversationally what it remembers, but the profile page exposes
only a voice preference. A mental coaching product should make its durable
context visible, correctable, and deletable without requiring a prompt.

This plan adds a bounded “What Anthon knows” surface using the existing schema.
It does not build a progress dashboard or expand what Anthon collects.

## Current state

- `prisma/schema.prisma:828-843` stores coaching profile fields including
  sport, goal, experience, birthday, and internal notes.
- `prisma/schema.prisma:868-882` stores user-owned categorized memories as JSON
  with a unique `(userId, key)`.
- `src/lib/maintenance/profile-analyzer.ts` can infer and update profile data.
- `src/lib/ai/memory-extractor.ts` persists high-confidence facts.
- `src/lib/ai/tools/memory.ts` expects memory JSON with `content`, `category`,
  and `confidence`, and owns the memory prompt cache.
- `src/lib/ai/tools/user-context.ts` owns profile prompt caches, but its
  invalidator is private.
- `src/app/(marketing)/profile/[[...rest]]/page.tsx:48-64` renders Clerk
  profile plus `PreferencesSection`; no coaching context is visible.
- `src/app/api/preferences/route.ts` is the local auth/response/test pattern.

## Target contract

- An authenticated user can view and edit `sport`, `goal`, and `experience`.
- The user can view memories as human-readable `content`, category, and update
  time; internal key and confidence are not returned.
- The user can correct memory content/category or delete a memory.
- Mutations target records by opaque ID plus authenticated `userId`; another
  user's ID is indistinguishable from missing.
- Empty profile values clear the field. Empty memory content is rejected;
  deletion remains explicit and confirmable.
- Every mutation invalidates all prompt caches that can contain the changed
  context.
- No schema migration, automatic extraction change, or raw internal notes UI
  is introduced.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| API tests | `bunx vitest run src/app/api/coaching-context/route.test.ts 'src/app/api/coaching-context/memories/[memoryId]/route.test.ts'` | all pass |
| Cache/tool tests | `bunx vitest run src/lib/ai/tools/memory.test.ts src/lib/ai/tools/user-context.test.ts` | all pass |
| UI tests | `bunx vitest run 'src/app/(marketing)/profile/components/CoachingContextSection.test.tsx'` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/app/api/coaching-context/route.ts` for `GET` and profile `PATCH`.
- `src/app/api/coaching-context/memories/[memoryId]/route.ts` for memory
  `PATCH` and `DELETE`.
- Colocated route tests.
- A shared, explicit cache-invalidating helper in the existing AI tool modules.
- `CoachingContextSection` and its component tests.
- The existing profile page composition.

**Out of scope**:

- Prisma schema/migration changes.
- Creating memories manually from the settings UI.
- Exposing `Profile.notes`, birthday, raw memory key, confidence, or extraction
  metadata.
- Changing automatic analyzer/extractor cadence or prompts.
- Progress scores, streaks, goals with status, reminders, notifications, or
  clinical records.
- Admin tools, export portability, RAG, or cross-account sharing.

## Git workflow

- Branch: `improve/035-user-owned-coaching-context`
- Commit: `feat(profile): let users manage coaching context`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Define a privacy-safe API representation

Create route-local schemas/types for:

- profile response: `sport`, `goal`, `experience`;
- memory response: `id`, trimmed `content`, allowed category, `updatedAt`;
- profile patch: only those three nullable/trimmed bounded strings;
- memory patch: bounded non-empty content and an existing allowed category.

Skip malformed legacy memory JSON from the response and emit a structured
count-only diagnostic; do not leak raw JSON. Use the category column as source
of truth. Choose conservative maximum lengths based on existing tool schemas
or database usage and cover them in tests.

**Verify**:
route tests prove the response excludes `key`, `confidence`, `notes`, and
`userId`.

### Step 2: Add authenticated profile read/write

Implement `GET /api/coaching-context` using `getAuthUser` and the existing API
response helpers. Fetch only the current user's selected profile fields and
memories, newest first.

Implement `PATCH /api/coaching-context` as an upsert of only
`sport`, `goal`, and `experience`. Reject unknown keys so future sensitive
fields cannot be mass-assigned. Export or wrap the existing user-context cache
invalidator and invalidate both full and tiny snapshots after mutation.

**Verify**:
tests cover 401, missing DB user, empty state, mapped state, partial update,
clear-to-null, unknown fields, oversized strings, cache invalidation, and
persistence failure.

### Step 3: Add ownership-scoped memory correction and deletion

Implement `PATCH` and `DELETE` for one opaque memory ID. First locate with
`findFirst({ where: { id: memoryId, userId: authUser.id } })`; return the same
not-found result for missing and foreign IDs. On patch, preserve the internal
key and rewrite the existing JSON envelope with corrected content/category,
confidence `1.0`, and `updatedAt`. Keep the category column synchronized.

After patch/delete, invalidate the memory cache and every tiny user snapshot
cache that includes memories. If invalidators currently have fragmented
ownership, add one named `invalidateCoachingContextPromptCaches(userId)`
composition helper rather than duplicating calls in routes.

**Verify**:
tests cover authentication, ownership isolation, malformed ID/body, update,
delete, not-found, synchronized category, JSON envelope, and invalidation.

### Step 4: Build “Cosa sa Anthon di te”

Add `CoachingContextSection` below `PreferencesSection`. Use existing card,
button, input/textarea, loading, error, toast, and confirmation patterns.

The section must:

- explain that the data personalizes future coaching;
- edit sport, goal, and experience with explicit Save/Cancel state;
- group or label memories by category in plain Italian;
- allow correction and a destructive confirmation before deletion;
- show useful empty, loading, retry, and saving states;
- remain keyboard accessible and usable on narrow mobile screens;
- never render raw keys, confidence, notes, or raw JSON.

Do not fetch until authenticated profile UI mounts. Prevent duplicate saves and
restore server state after failed mutations.

**Verify**:
component tests cover load, empty state, edit/save, validation error, failed
save rollback, delete confirmation/cancel/success, and accessible labels.

### Step 5: Verify browser behavior

Run the dev server and use the collaborative preview with a non-production
authenticated account when available. Verify desktop and mobile widths:
profile fields persist after reload, a memory correction appears after reload,
delete requires confirmation, and foreign/private data never appears in
network responses.

If safe auth is unavailable, do not create a bypass; report browser
verification as unavailable and rely on route/component tests.

**Verify**:
capture a screenshot or concise browser-visible report for normal and empty
states without including sensitive content.

### Step 6: Run repository gates

**Verify**:
`bun run verify && git diff --check` exits 0. Confirm `prisma/schema.prisma`
and migrations are untouched.

## Test plan

- Route authorization and same-user ownership isolation.
- Strict request validation and privacy-safe response projection.
- Profile partial update and clear behavior.
- Memory correction preserves JSON/tool compatibility.
- All relevant prompt caches invalidate after mutation.
- UI loading, empty, success, failure, edit, cancel, and delete states.
- Browser verification on desktop/mobile when safe auth exists.

## Done criteria

- [ ] Users can inspect and correct core coaching profile fields.
- [ ] Users can inspect, correct, and delete persistent memories.
- [ ] API responses exclude internal/sensitive implementation fields.
- [ ] Foreign IDs cannot reveal or mutate another user's data.
- [ ] Prompt caches cannot retain corrected/deleted values.
- [ ] No schema or extraction-policy change was introduced.
- [ ] Focused tests, browser check when available, full verify, and hygiene pass.

## STOP conditions

- The current schema cannot support ownership-scoped edit/delete safely.
- A migration or new consent-policy decision is required.
- Prompt-cache ownership cannot be invalidated comprehensively.
- The only browser verification path requires production data or an auth bypass.
- Existing user-owned profile UI changes overlap materially.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Any new persistent coaching field must declare whether users can view, correct,
delete, and export it. Keep API projection explicit; never return whole Prisma
records from this endpoint.
