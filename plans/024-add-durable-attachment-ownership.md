# Plan 024: Give every attachment durable ownership

> **Executor instructions**: Follow every step and gate. This is a fail-closed data migration: never guess ownership or delete unmatched data. The reviewer maintains the plan index.
>
> **Drift check (run first)**: `git diff --stat 56c0a0a..HEAD -- prisma/schema.prisma prisma/migrations src/app/api/upload/route.ts src/app/api/upload/route.test.ts src/lib/channels/web/chat-route-handler.ts src/app/api/chat/route.test.ts src/app/api/voice/generate/route.ts src/app/api/voice/generate/route.test.ts src/lib/voice/generation-jobs.ts src/lib/voice/generation-jobs.test.ts`

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

`Attachment` has no owner. Pending-upload deletion infers ownership from a Blob URL string, while chat linking trusts an unlinked row because its `message` relation is null. Add a mandatory owner, backfill existing rows deterministically, and make claiming atomic so one user can never attach or delete another user's file.

## Current state

- `prisma/schema.prisma:1017-1031` defines `Attachment` without `userId`.
- `src/app/api/upload/route.ts:197-204` creates pending attachments without an owner.
- DELETE at `:255-277` combines linked-message ownership with URL `contains`.
- `src/lib/channels/web/chat-route-handler.ts:344-395` reads an attachment, accepts `message: null`, then updates by ID.
- Voice attachments are created in `src/app/api/voice/generate/route.ts:297` and `src/lib/voice/generation-jobs.ts:621`.
- Prisma migrations use explicit PostgreSQL SQL and fail-closed assertions where necessary.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Schema | `bunx prisma validate && bunx prisma generate` | exit 0 |
| Focused tests | `bunx vitest run src/app/api/upload/route.test.ts src/app/api/chat/route.test.ts src/app/api/voice/generate/route.test.ts src/lib/voice/generation-jobs.test.ts` | all pass |
| Integration | `bun run test:integration` | passes on disposable Neon branch |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `prisma/schema.prisma`
- one new migration
- the four attachment creation/claim/delete modules and their existing tests
- integration fixtures that fail to compile because `userId` becomes required

**Out of scope**:

- upload response shapes, Blob visibility, file policy, guest uploads, cleanup scheduling, voice delivery behavior, attachment batching, or destructive orphan cleanup

## Git workflow

- Branch: `improve/024-attachment-ownership`
- Commit: `fix(attachments): persist durable ownership`
- Do not push or merge.

## Steps

### Step 1: Add the owner relation and fail-closed migration

Add `User.attachments`, required `Attachment.userId`, its `User` relation with `onDelete: Cascade`, and an index on `userId`.

Create a migration that:

1. Adds nullable `userId`.
2. Backfills message-linked rows from `Message.userId`.
3. Backfills only unlinked pending uploads by joining a user against the slash-delimited `/uploads/{id}/` or `/attachments/{id}/` Blob path.
4. Raises an exception if any attachment remains ownerless.
5. Only then sets `NOT NULL`, adds the foreign key, and adds the index.

Do not delete or assign unmatched rows.

**Verify**: Prisma validate/generate pass and manual SQL review confirms the assertion precedes `NOT NULL`.

### Step 2: Populate ownership in every creation path

Write `userId: user.id` in normal upload and synchronous voice creation. Write `userId: job.userId` in durable voice finalization. Update assertions in the corresponding tests.

**Verify**: upload and both voice test files pass.

### Step 3: Replace inferred deletion ownership

Change upload DELETE lookup to `{ blobUrl, userId: user.id }`. Preserve private/public Blob deletion routing and response shapes.

**Verify**: tests prove owner success and foreign-owner `404`, with no URL-path ownership predicate.

### Step 4: Make message claiming atomic

Replace read-then-update with `attachment.updateMany` constrained by attachment ID, current `userId`, and `messageId: null`. A count of zero skips linking and may log bounded IDs; it must not reveal ownership to the client or reassign an already-linked row.

**Verify**: tests cover own pending success, foreign pending denial, same-owner already-linked denial, and repeated IDs.

### Step 5: Update fixtures and run database rehearsal

Add explicit owner IDs to legitimate direct attachment fixtures. Run the migration and integration suite on the disposable Neon branch. If historical rows on that branch trigger the assertion, stop and report the unmatched count and metadata without deleting them.

**Verify**: `bun run test:integration` exits 0.

### Step 6: Run full gates

**Verify**: `bun run verify && git diff --check` exits 0.

## Test plan

- Owner persistence in all creation paths.
- Owner-only deletion independent of Blob path.
- Atomic claim for pending owner; denial for foreign or linked rows.
- Migration success for linked and recognized pending rows.
- Migration failure for an unmatched attachment.

## Done criteria

- [ ] `Attachment.userId` is required and foreign-keyed.
- [ ] Every runtime creator populates it.
- [ ] Delete and claim authorization use `userId`, never Blob path/message inference.
- [ ] Claims cannot reassign linked rows.
- [ ] Migration and focused/full gates pass.

## STOP conditions

- Any existing row cannot be deterministically mapped.
- A creator without a trustworthy internal user ID is found.
- Correctness requires deleting or guessing ownership.
- The integration runner cannot rehearse the migration.
- Verification fails twice.

## Maintenance notes

Before production deployment, run a read-only unmatched-row preflight against the target database. Any nonzero result blocks release and requires an explicit remediation plan.
