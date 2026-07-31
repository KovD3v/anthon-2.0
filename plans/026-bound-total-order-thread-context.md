# Plan 026: Bound and totally order thread context summaries

> **Executor instructions**: Follow each step and verification gate. Preserve the existing coaching-summary contract and stop instead of inventing new lifecycle behavior. The reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 56c0a0a..HEAD -- src/lib/ai/thread-context.ts src/lib/ai/thread-context.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

Summary refresh currently reads every message after a timestamp-only checkpoint into one prompt. Both context queries order only by `createdAt`, so same-timestamp rows can be reversed, complete turns can be dropped, and checkpoint rows can be skipped permanently. Apply the repository's `(createdAt, id)` chronology and a finite summary batch.

## Current state

- `buildThreadContext` reads a bounded descending window with `orderBy: { createdAt: "desc" }`.
- `refreshConversationThreadSummary` uses timestamp-only `createdAt > checkpoint`, ascending timestamp-only order, and no `take`.
- `toCompleteTurns` requires user then assistant order.
- `ConversationThreadSummary` already stores `throughMessageId`, `throughMessageCreatedAt`, and `version`.
- `src/app/api/chat/messages/route.ts:11-23` is the total-order exemplar.

## Internal contract

- Chronology: `(createdAt ASC, id ASC)`; reverse reads use both fields DESC before reversing.
- One refresh processes at most 40 message rows.
- Checkpoints advance only through the final complete assistant turn.
- Existing summary writes use optimistic `version` comparison so a stale refresh cannot regress the checkpoint.

## Scope

**In scope**: `src/lib/ai/thread-context.ts`, new `src/lib/ai/thread-context.test.ts`.

**Out of scope**: schema migrations, model choice, 250-word limit, chat API, cross-channel semantics, background queue design.

## Git workflow

- Branch: `improve/026-thread-context-order`
- Commit: `fix(ai): bound and order thread summaries`
- Do not push or merge.

## Steps

### Step 1: Introduce explicit bounds and tuple helpers

Name constants for the 40-row batch and existing six-turn/8,000-character thresholds. Add small helpers for tuple comparison and strict-after checkpoint predicates.

**Verify**: TypeScript passes through the focused test command.

### Step 2: Totally order raw context

Use `[{createdAt:"desc"},{id:"desc"}]`, then reverse. Compare the stored summary checkpoint with the oldest raw row using both fields.

**Verify**: tests cover same-timestamp raw turns and summary boundaries.

### Step 3: Bound and checkpoint summary refresh

Select at most 40 rows in ascending tuple order. With a complete checkpoint, query timestamp-after OR same-timestamp/higher-ID. Preserve timestamp-only fallback for legacy summaries lacking an ID. Never checkpoint a trailing unmatched user.

**Verify**: tests inspect the Prisma query and bounded transcript.

### Step 4: Prevent stale summary regression

Read `id` and `version`. Update an existing summary with `updateMany` constrained by both; increment version on success. On initial creation, treat a unique-conflict race as a discarded stale result. Track actual provider usage even if persistence loses the race and emit only bounded diagnostics.

**Verify**: a concurrent stale-write test proves the newer summary remains authoritative.

### Step 5: Run full gates

**Verify**: `bunx vitest run src/lib/ai/thread-context.test.ts && bun run verify && git diff --check` exits 0. Run `bun run test:coverage:unit` and report the known global branch-threshold result honestly.

## Test plan

- Equal-timestamp user/assistant total order.
- Assistant-before-user input does not fabricate a turn.
- Descending tuple read reverses correctly.
- Same-timestamp summary/raw boundary.
- Strict tuple checkpoint and 40-row `take`.
- Trailing incomplete turn remains uncheckpointed.
- Legacy checkpoint fallback.
- Successful write stores both fields and increments version.
- Stale concurrent write cannot overwrite a newer summary.

## Done criteria

- [ ] Both reads have a total order.
- [ ] Summary prompts are bounded to 40 rows.
- [ ] Tuple checkpoints cannot skip equal-timestamp rows.
- [ ] Incomplete turns are not checkpointed.
- [ ] Stale refreshes cannot regress the summary.
- [ ] Focused and full gates pass.

## STOP conditions

- IDs do not have stable database string ordering matching Prisma order.
- A schema migration is required.
- Correctness requires holding a database lock across model generation.
- Verification fails twice.

## Maintenance notes

Future pagination, deletion, and summarization must share the same tuple chronology. Keep prompt bounds explicit and test them whenever context policy changes.
