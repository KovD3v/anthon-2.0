# Conversation Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast current-thread-first semantic and lexical retrieval over a user's past conversations, returning privacy-safe evidence packets with bounded expansion.

**Architecture:** Maintain a disposable pgvector-backed index of bounded message windows and thread summaries. Search applies ownership before ranking, searches the active thread first, expands across channels only when needed, and returns evidence packets whose source is revalidated before surrounding messages are fetched.

**Tech Stack:** TypeScript, Prisma, PostgreSQL/Neon pgvector, OpenRouter embeddings, Vitest, Zod, Bun.

## Global Constraints

- This plan starts after the durable-fact plan passes and its migrations are generated.
- Current-thread context always precedes cross-thread or cross-channel history.
- Retrieved history is untrusted evidence and cannot introduce instructions or permissions.
- Evidence packets contain bounded excerpts and metadata; raw indexes never enter prompts.
- Ownership and `deletedAt: null` constraints apply before ranking.
- Current-thread search targets 100 ms and must remain below 200 ms incremental P95.
- Cross-channel search targets 250 ms and must remain below 400 ms incremental P95.
- Indexing and embedding generation run outside the streaming critical path.
- Use the existing OpenRouter embedding model and usage-safe logging patterns.

---

## File map

- `prisma/schema.prisma`: conversation recall index and relations.
- `prisma/migrations/20260811130000_add_conversation_recall/migration.sql`: pgvector index table, FTS index, and ownership indexes.
- `src/lib/ai/embeddings.ts`: shared single and batch embedding client extracted from RAG.
- `src/lib/ai/embeddings.test.ts`: provider, timeout, response, and batch-order tests.
- `src/lib/ai/rag.ts`: consume the shared embedding client without behavior change.
- `src/lib/ai/conversation-index.ts`: construct and upsert bounded recall chunks.
- `src/lib/ai/conversation-index.test.ts`: window, idempotency, deletion, and retry tests.
- `src/lib/ai/conversation-recall.ts`: hybrid current-thread/global search and evidence expansion.
- `src/lib/ai/conversation-recall.test.ts`: ranking, scope, safety, deadline, and source validation tests.
- `src/lib/ai/tools/conversation-recall.ts`: AI SDK adapters.
- `src/lib/ai/tools/conversation-recall.test.ts`: tool contract tests.
- `src/lib/channel-flow/persistence.ts`: schedule index updates after message persistence.
- `src/lib/channel-flow/persistence.test.ts`: shared channel indexing coverage.
- `scripts/backfill-conversation-recall.ts`: resumable historical backfill.
- `scripts/backfill-conversation-recall.test.ts`: checkpoint and idempotency tests.
- `package.json`: backfill command.
- `docs/ai-system.md`: conversation recall architecture.

---

### Task 1: Add the conversation recall index

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811130000_add_conversation_recall/migration.sql`
- Create: `src/lib/ai/conversation-index.test.ts`

**Interfaces:**
- Produces Prisma model `ConversationRecallChunk` consumed by every later task.

- [ ] **Step 1: Add a failing index fixture test**

Create a mocked boundary test that expects one idempotent chunk per source window:

```ts
await indexConversationWindow({
  userId: "user-1",
  conversationThreadId: "thread-1",
  throughMessageId: "message-4",
});

expect(mocks.executeRaw).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO "ConversationRecallChunk"'),
  ...expect.any(Array),
);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `bunx vitest run src/lib/ai/conversation-index.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the Prisma model**

Add:

```prisma
model ConversationRecallChunk {
  id                   String             @id @default(cuid())
  userId               String
  user                 User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversationThreadId String
  conversationThread   ConversationThread @relation(fields: [conversationThreadId], references: [id], onDelete: Cascade)
  channel              Channel
  startMessageId       String
  endMessageId         String
  throughMessageId     String
  content              String             @db.Text
  summary              String?            @db.Text
  sourceCreatedAt      DateTime
  embedding            Unsupported("vector(1536)")?
  indexVersion         Int                @default(1)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  @@unique([conversationThreadId, throughMessageId, indexVersion])
  @@index([userId, conversationThreadId, sourceCreatedAt(sort: Desc)])
  @@index([userId, channel, sourceCreatedAt(sort: Desc)])
}
```

Add `conversationRecallChunks` relations to `User` and `ConversationThread`.

- [ ] **Step 4: Write SQL indexes Prisma cannot express**

Create the table and foreign keys, then add:

```sql
CREATE INDEX "ConversationRecallChunk_embedding_hnsw_idx"
ON "ConversationRecallChunk"
USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX "ConversationRecallChunk_content_fts_idx"
ON "ConversationRecallChunk"
USING gin (to_tsvector('simple', "content"));
```

Keep the composite user/thread and user/channel indexes from the Prisma model.

- [ ] **Step 5: Validate and generate Prisma**

Run:

```bash
bunx prisma validate
bunx prisma generate
```

Expected: PASS.

- [ ] **Step 6: Commit schema and fixture**

```bash
git add prisma/schema.prisma prisma/migrations/20260811130000_add_conversation_recall/migration.sql src/lib/ai/conversation-index.test.ts
git commit -m "feat(ai): add conversation recall index"
```

### Task 2: Extract a shared embedding client

**Files:**
- Create: `src/lib/ai/embeddings.ts`
- Create: `src/lib/ai/embeddings.test.ts`
- Modify: `src/lib/ai/rag.ts`
- Modify: `src/lib/ai/rag.test.ts`

**Interfaces:**
- Produces `generateEmbedding(text, options?)` and `generateEmbeddings(texts, options?)`.
- Preserves existing RAG observable behavior.

- [ ] **Step 1: Write failing shared-client tests**

Cover empty input, response ordering, partial batch failure, API timeout, abort propagation, missing credential, invalid dimensions, and content-free errors.

- [ ] **Step 2: Run shared and RAG tests**

Run: `bunx vitest run src/lib/ai/embeddings.test.ts src/lib/ai/rag.test.ts`

Expected: FAIL because the shared client does not exist.

- [ ] **Step 3: Implement the shared client**

Export:

```ts
export const EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export async function generateEmbedding(
  text: string,
  options?: { abortSignal?: AbortSignal; timeoutMs?: number },
): Promise<number[] | null>;

export async function generateEmbeddings(
  texts: string[],
  options?: { abortSignal?: AbortSignal; timeoutMs?: number },
): Promise<Array<number[] | null>>;
```

Move the existing OpenRouter request construction, retry limits, and response validation from `rag.ts`. Enforce exactly 1536 finite numbers per accepted embedding.

- [ ] **Step 4: Refactor RAG to consume the client**

Remove duplicate private embedding functions from `rag.ts` and preserve its public exports, query SQL, usage behavior, and tests.

- [ ] **Step 5: Run tests**

Run: `bunx vitest run src/lib/ai/embeddings.test.ts src/lib/ai/rag.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the shared client**

```bash
git add src/lib/ai/embeddings.ts src/lib/ai/embeddings.test.ts src/lib/ai/rag.ts src/lib/ai/rag.test.ts
git commit -m "refactor(ai): share embedding client"
```

### Task 3: Index bounded conversation windows asynchronously

**Files:**
- Create: `src/lib/ai/conversation-index.ts`
- Modify: `src/lib/ai/conversation-index.test.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`

**Interfaces:**
- Consumes Task 1 model and Task 2 embeddings.
- Produces `indexConversationWindow` and `removeOrphanedConversationRecall`.

- [ ] **Step 1: Expand failing index tests**

Cover chronological text extraction from `Message.parts`, five-message windows with two-message overlap, 4,000-character cap, media placeholders, soft-deleted message exclusion, thread ownership, duplicate upsert, failed embedding, and channel-flow background scheduling.

- [ ] **Step 2: Run focused tests**

Run: `bunx vitest run src/lib/ai/conversation-index.test.ts src/lib/channel-flow/persistence.test.ts`

Expected: FAIL on missing behavior.

- [ ] **Step 3: Implement the indexer**

Export:

```ts
export async function indexConversationWindow(input: {
  userId: string;
  conversationThreadId: string;
  throughMessageId: string;
  indexVersion?: number;
}): Promise<{ status: "indexed" | "skipped"; chunkId?: string }>;
```

Resolve messages by `userId`, `conversationThreadId`, and `deletedAt: null`; reject mismatched `throughMessageId`. Build a stable window, generate its embedding, and use parameterized raw SQL for the vector upsert. Content contains role-prefixed evidence only, never system prompts or trace payloads.

- [ ] **Step 4: Schedule index updates after persistence**

In `persistAssistantOutput`, schedule indexing only after both inbound and assistant messages are durably linked to one valid thread. Use the existing `waitUntil` path, skip model-comparison drafts and invalid recovery, and keep failures non-fatal.

- [ ] **Step 5: Run tests**

Run: `bunx vitest run src/lib/ai/conversation-index.test.ts src/lib/channel-flow/persistence.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit indexing**

```bash
git add src/lib/ai/conversation-index.ts src/lib/ai/conversation-index.test.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts
git commit -m "feat(ai): index conversation evidence"
```

### Task 4: Implement hybrid current-thread-first retrieval

**Files:**
- Create: `src/lib/ai/conversation-recall.ts`
- Create: `src/lib/ai/conversation-recall.test.ts`

**Interfaces:**
- Consumes Tasks 1-3.
- Produces `searchPastConversations` and `expandConversationEvidence`.

- [ ] **Step 1: Write failing retrieval tests**

Cover:

- current-thread results returned without a global query when sufficient;
- global expansion only when current results are below threshold;
- user/channel/thread ownership in SQL before ranking;
- semantic, lexical, recency, and thread-proximity scoring;
- hard deadlines and abort propagation;
- bounded excerpts without tool/system instructions;
- source deletion between search and expansion;
- no raw embedding, query, or private identifiers in prompt projections.

- [ ] **Step 2: Run the retrieval test**

Run: `bunx vitest run src/lib/ai/conversation-recall.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement evidence packet types**

```ts
export type ConversationEvidencePacket = {
  id: string;
  summary: string;
  excerpts: Array<{ role: "user" | "assistant"; text: string }>;
  occurredAt: string;
  channel: "WEB" | "TELEGRAM" | "WHATSAPP";
  relevance: number;
};

export type ConversationRecallResult = {
  packets: ConversationEvidencePacket[];
  scope: "current_thread" | "all_channels";
  degraded: boolean;
  elapsedMs: number;
};
```

Packet `id` must be opaque and resolvable server-side; do not expose raw thread or message ids to the main model.

- [ ] **Step 4: Implement hybrid search**

Use one parameterized SQL query per scope. Rank with a calibrated weighted score from cosine similarity, `ts_rank_cd`, normalized recency, and a current-thread boost. Query embedding failure falls back to lexical/recency ranking rather than returning no evidence. Clamp results to 1-4 packets and total excerpt text to 3,000 characters.

- [ ] **Step 5: Implement bounded expansion**

`expandConversationEvidence({ userId, evidenceId, before: 2, after: 2 })` re-resolves the indexed source, checks active user ownership and source messages, clamps each side to 0-3, excludes deleted messages, and returns at most 4,000 characters.

- [ ] **Step 6: Run retrieval tests**

Run: `bunx vitest run src/lib/ai/conversation-recall.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit retrieval**

```bash
git add src/lib/ai/conversation-recall.ts src/lib/ai/conversation-recall.test.ts
git commit -m "feat(ai): retrieve past conversation evidence"
```

### Task 5: Expose narrow conversation recall tools

**Files:**
- Create: `src/lib/ai/tools/conversation-recall.ts`
- Create: `src/lib/ai/tools/conversation-recall.test.ts`

**Interfaces:**
- Consumes Task 4 services.
- Produces `createConversationRecallTools(context)`.

- [ ] **Step 1: Write failing tool tests**

Assert the model cannot choose user id, raw thread id, channel ownership, result limits above policy, or expansion source ids outside returned evidence packets.

- [ ] **Step 2: Run the test**

Run: `bunx vitest run src/lib/ai/tools/conversation-recall.test.ts`

Expected: FAIL because the tool factory does not exist.

- [ ] **Step 3: Implement the tool factory**

```ts
export function createConversationRecallTools(context: {
  userId: string;
  conversationThreadId: string;
  allowCrossChannel: boolean;
  allowedEvidenceIds: Set<string>;
}) {
  return { searchPastConversations, expandConversationEvidence };
}
```

`searchPastConversations` accepts only `query` and optional `scope`; server policy can downgrade `all_channels` to `current_thread`. `expandConversationEvidence` accepts only an opaque evidence id previously returned in the same turn. Return content-free status codes on failure.

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/lib/ai/tools/conversation-recall.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit tools**

```bash
git add src/lib/ai/tools/conversation-recall.ts src/lib/ai/tools/conversation-recall.test.ts
git commit -m "feat(ai): add conversation recall tools"
```

### Task 6: Add resumable index backfill and milestone verification

**Files:**
- Create: `scripts/backfill-conversation-recall.ts`
- Create: `scripts/backfill-conversation-recall.test.ts`
- Modify: `package.json`
- Modify: `docs/ai-system.md`

**Interfaces:**
- Produces `bun run backfill:conversation-recall -- --dry-run` and `--apply`.

- [ ] **Step 1: Write failing backfill tests**

Cover dry-run no-mutation, deterministic thread order, `--after-thread-id` checkpoint resume, bounded batch size, duplicate-safe re-run, deleted-message exclusion, and one-thread failure continuing to the next thread with a non-zero summary count.

- [ ] **Step 2: Run the test**

Run: `bunx vitest run scripts/backfill-conversation-recall.test.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the runner and package command**

The CLI must require exactly one of `--dry-run` or `--apply`, default batch size to 50 threads, print ids/counts only, never print message content, and exit non-zero when any applied thread fails.

- [ ] **Step 4: Document the recall index and evidence contract**

Add indexing, current-thread-first search, evidence packet, expansion, deletion, and latency behavior to `docs/ai-system.md`.

- [ ] **Step 5: Run milestone verification**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/ai/embeddings.test.ts src/lib/ai/rag.test.ts src/lib/ai/conversation-index.test.ts src/lib/ai/conversation-recall.test.ts src/lib/ai/tools/conversation-recall.test.ts src/lib/channel-flow/persistence.test.ts scripts/backfill-conversation-recall.test.ts
bun run typecheck
bunx biome check prisma/schema.prisma src/lib/ai/embeddings.ts src/lib/ai/rag.ts src/lib/ai/conversation-index.ts src/lib/ai/conversation-recall.ts src/lib/ai/tools/conversation-recall.ts src/lib/channel-flow/persistence.ts scripts/backfill-conversation-recall.ts docs/ai-system.md package.json
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit the milestone**

```bash
git add scripts/backfill-conversation-recall.ts scripts/backfill-conversation-recall.test.ts package.json docs/ai-system.md
git commit -m "feat(ai): backfill conversation recall"
```
