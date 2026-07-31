# Plan 031: Fetch only fields used to build AI conversation context

> **Executor instructions**: Execute only after plan 026's approved commit is
> integrated into the working branch. Preserve its total ordering, bounded
> summary batches, and optimistic checkpoint behavior. Follow every gate and
> stop on drift rather than adapting around a missing plan-026 implementation.
> The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 56c0a0a..HEAD -- src/lib/ai/thread-context.ts src/lib/ai/thread-context.test.ts src/lib/ai/session-manager.ts src/lib/ai/session-manager.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/026-bound-total-order-thread-context.md`, `plans/027-add-authenticated-chat-performance-gate.md`
- **Category**: perf
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

Both current context builders bound row count but fetch complete `Message`
records. `Message` includes metadata, reasoning content, tool calls, metrics,
and other fields not used to create model history. Every history-enabled turn
therefore transfers and deserializes avoidable database payload before the
character budget trims context.

Explicit Prisma selections reduce hot-path DB egress and allocation without
changing prompt semantics.

## Current state

- `src/lib/ai/thread-context.ts:62-71` has no `select`; downstream
  `toCompleteTurns`, `contextText`, and `toModelMessage` use only `id`, `role`,
  `parts`, and `createdAt`.
- The approved plan-026 implementation at commit `6f91bc2` adds total tuple
  ordering, a 40-row summary bound, and optimistic version writes. It still
  fetches full messages; those behaviors must remain intact.
- `src/lib/ai/session-manager.ts:190-196` has no `select`; session grouping and
  model conversion use `id`, `role`, `parts`, and `createdAt`.
- `src/lib/ai/session-manager.test.ts:41-81` currently builds full mock rows,
  so tests do not enforce a narrow query.
- Repository TypeScript convention uses generated Prisma types and
  `satisfies` rather than `any` or unchecked casts.

## Target contract

- Define one explicit selected-row shape per module, or one shared server-only
  shape if it does not create a dependency cycle.
- Select exactly `id`, `role`, `parts`, and `createdAt` for message context.
- Preserve all `where`, order, `take`, checkpoint, exclusion, session, and
  character-budget behavior.
- Tests assert the Prisma `select` so later schema growth cannot silently
  expand hot-path payloads.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Thread tests | `bunx vitest run src/lib/ai/thread-context.test.ts` | all plan-026 and new tests pass |
| Session tests | `bunx vitest run src/lib/ai/session-manager.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Full gate | `bun run verify` | exit 0 |
| Auth performance | command from plan 027 | no authenticated latency regression; DB phase/payload improves when measurable |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/ai/thread-context.ts`
- `src/lib/ai/thread-context.test.ts`
- `src/lib/ai/session-manager.ts`
- `src/lib/ai/session-manager.test.ts`

**Out of scope**:

- Prompt wording, history limits, character budgets, session thresholds, or
  summarization model.
- Any schema or migration change.
- Message API response payloads.
- Changing plan-026 tuple ordering, batch size, checkpoint, or concurrency logic.
- Selecting attachment/relation data for model context.

## Git workflow

- Branch: `improve/031-narrow-context-select`
- Commit: `perf(ai): narrow context message reads`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Confirm plan 026 is integrated

Verify the live `thread-context.ts` contains:

- tuple ordering by `createdAt` and `id`;
- `SUMMARY_BATCH_MESSAGE_LIMIT`;
- optimistic version-constrained summary update;
- its focused test file.

If any item is absent, stop. Do not cherry-pick, merge, or reproduce plan 026
inside this plan.

**Verify**:
`git merge-base --is-ancestor 6f91bc2 HEAD` exits 0 and
`bunx vitest run src/lib/ai/thread-context.test.ts` passes.

### Step 2: Narrow thread-context reads

Define a `satisfies Prisma.MessageSelect` constant and derive its payload type
with `Prisma.MessageGetPayload`. Replace full `Message` annotations in `Turn`
and helper signatures with that selected type. Add the same explicit `select`
to both recent-context and summary-refresh `findMany` calls.

Do not add fields merely to satisfy the old broad type; update the local type to
describe actual use.

**Verify**:
thread-context tests pass and assert the exact `select`.

### Step 3: Narrow session-manager reads

Apply the same pattern in `session-manager.ts`. Update `Session`,
`groupMessagesIntoSessions`, `createSession`, `summarizeSession`, and
`toModelMessage` to accept the selected row. Simplify test fixtures to the four
selected fields and assert the query shape for chat-scoped and global modes.

**Verify**:
`bunx vitest run src/lib/ai/session-manager.test.ts` → all pass.

### Step 4: Run type, full, and performance gates

**Verify**:
`bun run typecheck && bun run verify && git diff --check` → exit 0.

When plan 027's safe environment is available, compare the same authenticated
history-enabled prompts. Record aggregate timing only; do not claim a latency
gain if environment noise masks it.

## Test plan

- Exact `select` for recent thread context.
- Exact `select` for summary refresh while retaining plan-026 order/take.
- Exact `select` for chat-scoped session-manager history.
- Exact `select` for user-scoped session history.
- Existing role mapping, session grouping, summary cache, truncation, tuple
  order, and stale-write tests remain green.
- Compile-time selected-row types contain no `any`.

## Done criteria

- [ ] Plan 026 is an ancestor and all its tests pass.
- [ ] Every in-scope message `findMany` has the four-field explicit selection.
- [ ] No helper requires a full generated `Message`.
- [ ] Query semantics and prompt output remain unchanged.
- [ ] Focused tests, typecheck, and `bun run verify` pass.
- [ ] Safe plan-027 comparison shows no regression.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- Commit `6f91bc2` is not integrated into the execution branch.
- A helper actually requires another field for correctness.
- Prisma cannot derive the selected payload without an unsafe cast.
- Tests reveal prompt or ordering changes.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Keep these selections explicit when `Message` gains new columns. Adding a field
to the schema must not expand AI context reads unless prompt construction
demonstrably needs it and tests are updated intentionally.
