# Plan 016: Add and verify a pgvector ANN index for RAG search

> **Executor instructions**: Follow every step and verification gate. Stop on any STOP condition; do not improvise. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/lib/ai/rag.ts src/lib/ai/rag.test.ts prisma/schema.prisma prisma/migrations docs/database.md`
> Compare live code with the excerpts below after any drift; semantic mismatch is a STOP condition.

## Status

- **Execution status**: BLOCKED on 2026-07-15 — the repository has no representative disposable RAG corpus/query set and no owner-approved ANN recall floor. No speculative migration was created.
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

RAG retrieval runs synchronously on the chat path. Its cosine-distance `ORDER BY ... LIMIT` currently has no matching pgvector index, so database work grows with every chunk. Add an ANN index only after measuring representative recall and query plans; the index method and tuning are correctness/performance trade-offs, not a blind migration.

## Current state

- `src/lib/ai/rag.ts:242-255` joins `RagChunk` to `RagDocument`, filters non-null embeddings, orders by `rc.embedding <=> $1::vector`, and limits results.
- `prisma/schema.prisma:931-945` defines `vector(1536)` and ordinary indexes on `documentId`; its comment claims `20251202120000_fix_vector_index/migration.sql` creates HNSW, but that migration does not exist and migration search finds no HNSW/IVFFlat operator-class index.
- `src/lib/ai/rag.test.ts` is the unit pattern; `scripts/run-ephemeral-integration-tests.ts` is the disposable Neon integration path.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Schema | `bunx prisma validate && bunx prisma generate` | both exit 0 |
| RAG tests | `bunx vitest run src/lib/ai/rag.test.ts` | all pass |
| Integration | `bun run test:integration` | all pass on an ephemeral Neon branch |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**: `prisma/schema.prisma` comment correction if needed, one new migration under `prisma/migrations/`, `src/lib/ai/rag.test.ts`, one focused integration/performance test colocated under `src/lib/ai/`, and `docs/database.md` for operator class/tuning/runbook.

**Out of scope**: changing embedding model/dimensions, similarity threshold, RAG gating, query response shape, or production migration execution.

## Git workflow

- Branch: `advisor/016-rag-ann-index`
- Conventional commit: `perf(rag): index vector similarity search`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Establish a representative baseline

On a disposable database with a representative chunk count/distribution, capture `EXPLAIN (ANALYZE, BUFFERS)` for the live parameterized cosine query, p50/p95 latency across a fixed query set, and exact top-k results. Record corpus size, PostgreSQL/pgvector versions, warmup, and repetitions in the test/runbook. Do not include document content.

**Verify**: baseline artifact contains plan nodes, timings, buffers, and exact-result IDs for every fixed query.

### Step 2: Add one ANN migration

Choose HNSW or IVFFlat with `vector_cosine_ops` based on supported Neon/pgvector versions and measured corpus behavior. Create one migration using `CREATE INDEX` with a stable name; include the deployment-lock/runtime implications in `docs/database.md`. Correct the stale schema comment to point to the actual migration. Do not add both methods.

**Verify**: `bunx prisma validate && bunx prisma generate` exits 0; migration SQL contains the intended operator class and no unrelated DDL.

### Step 3: Verify plan use, recall, and latency

Apply the migration only to the disposable branch. Re-run the fixed query set and prove the planner uses the index at a corpus size where it is expected. Compare ANN results to exact results and document an owner-reviewed recall floor; compare p50/p95 and buffers. Keep exact scan as the baseline, not a mocked assertion.

**Verify**: integration/performance test reports corpus size, index plan, recall@k, and latency; all agreed thresholds pass.

### Step 4: Run repository gates

**Verify**: `bunx vitest run src/lib/ai/rag.test.ts && bun run test:integration && bun run verify && git diff --check` -> all exit 0.

## Test plan

- Preserve unit tests for query construction and threshold filtering.
- Add disposable-DB verification for index existence/operator class and representative `EXPLAIN` use.
- Compare ANN top-k with exact cosine top-k across fixed non-sensitive vectors; assert the reviewed recall floor.
- Record latency as diagnostic evidence; avoid a flaky absolute CI timing threshold unless the environment is controlled.

## Done criteria

- [ ] Migration creates one compatible cosine ANN index and schema docs point to it.
- [ ] Representative `EXPLAIN` uses the index and recall remains above the reviewed floor.
- [ ] Before/after latency and buffers are recorded without sensitive content.
- [ ] Schema, focused tests, integration tests, full gate, and diff hygiene pass.
- [ ] Only in-scope files and the plan index changed.

## STOP conditions

- No representative disposable corpus/query set or owner-approved recall floor is available.
- Deployed pgvector/Neon version does not support the chosen method/operator class.
- The planner cannot use the index without changing query semantics, or recall loss is unacceptable.
- Production requires non-transactional/concurrent index deployment that the current migration owner cannot safely serialize.

## Maintenance notes

Re-benchmark after embedding-dimension/model changes or large corpus growth. Review index build time, storage, recall, and query plans together; an index existing in schema is not proof that production uses it.
