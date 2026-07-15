# Plan 015: Use a total order for chat suffix deletion

> **Executor instructions**: Follow each step and verification gate. Stop rather than improvise when a STOP condition occurs. Update the plan index when complete unless the reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts src/app/api/chat/messages/route.integration.test.ts`
> If an in-scope file changed, compare it with the excerpts below; semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

GET defines message chronology by `(createdAt, id)`, but DELETE and PATCH delete every row with `createdAt >= target.createdAt`. If two messages share a database timestamp, selecting the later ID can incorrectly delete the earlier message. Reuse the established total order for suffix deletion so editing/deleting removes exactly the selected message and everything after it.

## Current state

- `src/app/api/chat/messages/route.ts:49-72` already defines newest/chronological ordering with timestamp then ID:

```ts
orderBy: [{ createdAt: "desc" }, { id: "desc" }]
// chronological tie-break:
return createdAtDifference || first.id.localeCompare(second.id);
```

- DELETE (`:160-175`) and PATCH (`:276-287`) both build:

```ts
const deletedMessageWhere = {
  userId: user.id,
  chatId: message.chatId,
  createdAt: { gte: message.createdAt },
};
```

- The same predicate is passed first to `deletePrivateVoiceBlobsForMessages` and then to `message.deleteMany`; these must remain identical so blob cleanup matches deleted database rows.
- `src/app/api/chat/messages/route.test.ts:382-417,588-628` asserts the current predicate for both methods. `route.integration.test.ts` is the existing database-backed pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bunx vitest run src/app/api/chat/messages/route.test.ts` | all pass |
| Integration test | `bunx vitest run src/app/api/chat/messages/route.integration.test.ts` | passes when integration DB is configured; otherwise use the repo's documented integration runner |
| Full verification | `bun run verify` | exit 0 |
| Diff hygiene | `git diff --check` | no output, exit 0 |

## Scope

**In scope**:

- `src/app/api/chat/messages/route.ts`
- `src/app/api/chat/messages/route.test.ts`
- `src/app/api/chat/messages/route.integration.test.ts`

**Out of scope**:

- changing the public DELETE/PATCH request or response shapes
- message ID generation, GET pagination/windowing, soft deletion, restoration, chat ownership rules, or blob cleanup implementation
- schema or migration changes; the existing `(createdAt, id)` order is sufficient

## Git workflow

- Branch: `advisor/015-total-order-chat-delete`
- Conventional commit: `fix(chat): preserve earlier same-timestamp messages`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a shared suffix predicate in the route module

Create a small typed helper that returns a `Prisma.MessageWhereInput` for the selected message's user/chat scope and the inclusive total-order suffix:

```ts
OR: [
  { createdAt: { gt: message.createdAt } },
  { createdAt: message.createdAt, id: { gte: message.id } },
]
```

Use `gte` on ID so the selected message is included. Keep nullable `chatId` semantics identical to the current route. Use this one predicate object for both private-blob cleanup and `deleteMany`.

**Verify**: `bunx vitest run src/app/api/chat/messages/route.test.ts` -> all tests pass after expectation updates.

### Step 2: Use the helper from both DELETE and PATCH

Replace both timestamp-only predicates with the helper. Do not change authentication, ownership/role validation, cleanup-before-delete ordering, returned counts/content, or logging.

**Verify**: `rg -n 'createdAt: \{ gte: message\.createdAt \}' src/app/api/chat/messages/route.ts` -> no matches; unit test command exits 0.

### Step 3: Add collision regression tests

In unit tests, assert DELETE and PATCH pass the exact OR predicate to both cleanup and deletion. In the integration test, insert at least three messages in one chat: an earlier ID and selected later ID sharing one timestamp, plus a later timestamp. Delete/edit the selected row and assert the earlier same-timestamp row survives while the selected and later rows are removed. Use deterministic IDs whose lexical ordering is explicit.

**Verify**: `bunx vitest run src/app/api/chat/messages/route.integration.test.ts` -> regression passes against the configured ephemeral/test database.

### Step 4: Run full gates

**Verify**: `bun run verify && git diff --check` -> exit 0 and no whitespace errors.

## Test plan

- Update existing DELETE and PATCH cascade unit tests to assert the shared total-order predicate.
- Add same-timestamp unit coverage for both methods.
- Add a database-backed collision regression using the existing integration test setup.
- Retain authorization, role, cleanup-failure, and delete-failure cases unchanged.

## Done criteria

- [ ] DELETE and PATCH use identical `(createdAt, id)` inclusive suffix semantics.
- [ ] Cleanup and database deletion receive the same predicate.
- [ ] An earlier ID at the selected timestamp survives; selected and later IDs are deleted.
- [ ] Public responses and authorization behavior are unchanged.
- [ ] Unit, available integration, full verification, and diff hygiene gates pass.
- [ ] Only in-scope files changed; plan index updated by executor/reviewer.

## STOP conditions

- Live GET order no longer uses `(createdAt, id)` or IDs are not stably comparable with Prisma string ordering.
- The integration environment cannot set deterministic equal timestamps; report this rather than weakening the regression to mocks only.
- Blob cleanup cannot accept the same Prisma OR predicate without changing its implementation.
- A schema change or out-of-scope public API change appears necessary.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Any future pagination cursor, edit, regenerate, or suffix operation must use the same `(createdAt, id)` order. Reviewers should compare GET ordering, cleanup selection, and deletion selection together; divergence recreates orphan or over-delete bugs.
