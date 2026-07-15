# Plan 017: Bound and checkpoint missing-embedding backfill

> **Executor instructions**: Follow every step and gate. Stop on STOP conditions. Update the index row when done unless a reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/app/api/rag/documents/route.ts src/app/api/rag/documents/route.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/016-add-pgvector-ann-index.md`
- **Category**: perf
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

`updateMissingEmbeddings` loads the entire backlog and performs one sequential update per chunk inside a synchronous PATCH request. Large or partially failing backfills can exhaust function memory/time and restart without a bounded continuation contract. Make each invocation deterministic, retry-safe, observable, and bounded.

## Current state

- `src/lib/ai/rag.ts:383-417` selects every `embedding IS NULL` row, batches only model calls, then awaits one SQL update per chunk.
- `src/app/api/rag/documents/route.ts:107-121` runs the whole operation synchronously and returns only `updatedCount`.
- `RAG.BATCH_SIZE` is the embedding-provider batch size; it is not a database-work or invocation bound.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bunx vitest run src/lib/ai/rag.test.ts src/app/api/rag/documents/route.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**: `src/lib/ai/rag.ts`, `src/lib/ai/rag.test.ts`, `src/app/api/rag/documents/route.ts`, `src/app/api/rag/documents/route.test.ts`.

**Out of scope**: embedding model/dimension changes, ANN tuning, public document CRUD, queues/new infrastructure, or production backfill execution.

## Git workflow

- Branch: `advisor/017-bounded-rag-backfill`
- Conventional commit: `perf(rag): bound embedding backfill`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define a bounded result contract

Change the service to accept a clamped page size and optional stable cursor and return `{ processed, updated, failed, hasMore, nextCursor }`. Select at most `limit + 1` missing rows ordered by ID (or another proven stable unique order). Do not claim completion when failures remain.

**Verify**: focused service tests cover empty, single page, continuation, clamping, and stable ordering.

### Step 2: Replace sequential writes with a safe batch persistence boundary

Keep provider embedding batches, but persist successful results with one parameterized set-based statement or a bounded transaction per batch. Preserve vector casts and map results by chunk ID. Never interpolate IDs/vectors into SQL text. A retry must safely skip rows already filled and revisit failed null rows.

**Verify**: tests prove multiple embeddings use bounded/set-based writes, partial provider output remains retryable, and a repeated cursor does not corrupt completed rows.

### Step 3: Expose continuation and progress from PATCH

Validate query/body pagination input with the route's existing conventions and return the bounded result. Preserve authentication and error response shape where possible. The caller must be able to continue until `hasMore` is false without one long request.

**Verify**: route tests cover unauthorized, invalid/clamped input, first page, continuation, partial failure, and completion.

### Step 4: Run gates

**Verify**: `bunx vitest run src/lib/ai/rag.test.ts src/app/api/rag/documents/route.test.ts && bun run verify && git diff --check` -> all exit 0.

## Test plan

- Model after existing RAG and route mocks; no live OpenRouter calls.
- Cover deterministic pages with concurrent insertion and already-updated rows.
- Assert SQL remains parameterized and work never exceeds configured limits.
- Add a multi-page characterization that reaches completion with no duplicates/skips.

## Done criteria

- [ ] No invocation loads the entire missing-embedding backlog.
- [ ] Database writes are set-based or conservatively bounded, not one unbounded sequential round trip per row.
- [ ] Progress/continuation is explicit and retries are safe.
- [ ] Focused and full verification pass; only in-scope files/index changed.

## STOP conditions

- Stable continuation cannot be guaranteed under concurrent inserts/updates with the selected cursor.
- Set-based vector updates require unsafe interpolation or unsupported database features.
- The intended caller requires a durable queue rather than bounded HTTP continuation; report that architecture decision instead of adding infrastructure.

## Maintenance notes

Keep provider batch size, DB batch size, and per-invocation cap separate. Revisit them when provider limits or serverless duration change.
