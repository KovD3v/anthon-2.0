# Durable Fact Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opaque all-or-nothing memory access with a canonical, versioned durable-fact service and reliable asynchronous consolidation on every authenticated completed turn.

**Architecture:** Evolve the existing `Memory` row into the current fact state, add append-only revisions and provenance, route fixed fields to `Profile` or `Preferences`, and make all tools consume one service. Shared channel persistence schedules an idempotent consolidator independently of main-model tool calls.

**Tech Stack:** TypeScript, Next.js 16, Vercel AI SDK, Prisma, PostgreSQL/Neon, Vitest, Zod, Bun.

## Global Constraints

- Preserve guest memory denial and exact user ownership on every query and mutation.
- Ordinary durable facts may be consolidated silently; sensitive or high-impact facts require attributable natural confirmation.
- Explicit remember, revise, and forget requests must not depend on optional `toolChoice: "auto"`.
- Current explicit statements outrank profile, preferences, stored facts, and historical evidence.
- Do not persist assistant-authored claims as user facts.
- Consolidation must be asynchronous and must not delay streaming.
- Cached fact recall should target 25 ms and remain below the 100 ms incremental P95 ceiling.
- Use `bun run`, `bunx`, Biome, the project logger, and existing `@/*` aliases.
- Preserve unrelated worktree changes and commit only files named by each task.

---

## File map

- `prisma/schema.prisma`: durable-fact lifecycle, revision, and provenance relations.
- `prisma/migrations/20260811120000_add_memory_fact_lifecycle/migration.sql`: additive schema and existing-memory backfill.
- `src/lib/ai/memory-facts.ts`: canonical fact read/write/revise/forget service and cache.
- `src/lib/ai/memory-facts.test.ts`: service ownership, versioning, expiry, ranking, and idempotency tests.
- `src/lib/ai/memory-canonicalization.ts`: key normalization and canonical owner routing.
- `src/lib/ai/memory-canonicalization.test.ts`: alias, destination, and rejection tests.
- `src/lib/ai/memory-consolidator.ts`: candidate extraction and post-turn persistence.
- `src/lib/ai/memory-consolidator.test.ts`: extraction, routing, sensitivity, and duplicate tests.
- `src/lib/ai/memory-approval.ts`: deferred presentation and attributable resolution.
- `src/lib/ai/memory-approval.test.ts`: unpresented, presented, expiry, and thread-isolation tests.
- `src/lib/ai/tools/memory.ts`: thin AI SDK tool adapters over the fact service.
- `src/lib/ai/tools/memory.test.ts`: tool authorization and result-contract tests.
- `src/lib/ai/tools/user-context.ts`: canonical profile/preference mutations through shared routing.
- `src/lib/channel-flow/persistence.ts`: schedule consolidation for both planner modes.
- `src/lib/channel-flow/persistence.test.ts`: shared-channel scheduling and fail-open response tests.
- `src/app/api/chat/route.test.ts`: Web persistence regression coverage.
- `docs/ai-system.md`: durable-memory runtime documentation.

---

### Task 1: Add fact lifecycle and revision persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811120000_add_memory_fact_lifecycle/migration.sql`
- Test: `src/lib/ai/memory-facts.test.ts`

**Interfaces:**
- Produces Prisma enums `MemoryFactOrigin`, `MemoryFactSensitivity`, and `MemoryFactStatus`.
- Produces `MemoryRevision` and enriched `Memory` fields consumed by Task 3.

- [ ] **Step 1: Add a failing service fixture test for enriched memory rows**

Create `src/lib/ai/memory-facts.test.ts` with a mocked Prisma boundary and assert that `recallFacts()` ignores expired, deleted, and superseded rows while returning active rows with provenance:

```ts
it("returns only current active facts", async () => {
  mocks.memoryFindMany.mockResolvedValue([
    buildFact({ key: "training_schedule", status: "ACTIVE" }),
  ]);

  await expect(
    recallFacts({ userId: "user-1", query: "quando mi alleno", limit: 4 }),
  ).resolves.toMatchObject({
    facts: [{ key: "training_schedule", content: "Martedì sera" }],
  });
  expect(mocks.memoryFindMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", status: "ACTIVE" }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `bunx vitest run src/lib/ai/memory-facts.test.ts`

Expected: FAIL because `@/lib/ai/memory-facts` does not exist.

- [ ] **Step 3: Extend the Prisma schema**

Add:

```prisma
enum MemoryFactOrigin {
  EXPLICIT
  INFERRED
  CONFIRMED
  MIGRATED
}

enum MemoryFactSensitivity {
  LOW
  HIGH
}

enum MemoryFactStatus {
  ACTIVE
  SUPERSEDED
  DELETED
}

model MemoryRevision {
  id              String            @id @default(cuid())
  userId          String
  user            User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  memoryId        String
  memory          Memory            @relation(fields: [memoryId], references: [id], onDelete: Cascade)
  sourceMessageId String?
  sourceMessage   Message?          @relation("MemoryRevisionSource", fields: [sourceMessageId], references: [id], onDelete: SetNull)
  previousValue   Json?
  nextValue       Json?
  origin          MemoryFactOrigin
  reason          String
  dedupeKey       String            @unique
  createdAt       DateTime          @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([memoryId, createdAt(sort: Desc)])
  @@index([sourceMessageId])
}
```

Extend `Memory` with `origin`, `sensitivity`, `confidence`, `status`, `sourceMessageId`, `sourceThreadId`, `observedAt`, `lastConfirmedAt`, `expiresAt`, and `revisions`. Add named `Message` and `ConversationThread` relations. Keep `@@unique([userId, key])` so one row remains the current canonical fact state.

Extend `MemoryApproval` with nullable `presentationInboundMessageId` and
`presentationAssistantMessageId` relations. A background candidate has neither;
the next forced presentation turn sets both. Resolution must attribute the
current reply to `presentationAssistantMessageId`, never merely to the original
fact-source message.

- [ ] **Step 4: Write the additive migration and deterministic backfill**

The migration must create enums and `MemoryRevision`, add nullable foreign keys and indexed lifecycle fields, then backfill existing rows:

```sql
UPDATE "Memory"
SET
  "origin" = 'MIGRATED',
  "sensitivity" = CASE
    WHEN "category" IN ('health', 'diagnosis', 'trauma', 'intimate')
      THEN 'HIGH'::"MemoryFactSensitivity"
    ELSE 'LOW'::"MemoryFactSensitivity"
  END,
  "confidence" = COALESCE(
    CASE
      WHEN jsonb_typeof("value"->'confidence') = 'number'
        THEN ("value"->>'confidence')::double precision
    END,
    1.0
  ),
  "status" = 'ACTIVE',
  "observedAt" = "createdAt";
```

After backfill, make required lifecycle columns non-null and add ownership/status indexes.

- [ ] **Step 5: Validate and generate Prisma**

Run:

```bash
bunx prisma validate
bunx prisma generate
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the schema task**

```bash
git add prisma/schema.prisma prisma/migrations/20260811120000_add_memory_fact_lifecycle/migration.sql src/lib/ai/memory-facts.test.ts
git commit -m "feat(ai): add durable fact lifecycle"
```

### Task 2: Canonicalize memory destinations and keys

**Files:**
- Create: `src/lib/ai/memory-canonicalization.ts`
- Create: `src/lib/ai/memory-canonicalization.test.ts`

**Interfaces:**
- Produces `canonicalizeKnowledgeCandidate(candidate): CanonicalKnowledgeCandidate`.
- Produces destination union `"profile" | "preferences" | "memory"` consumed by Tasks 3 and 5.

- [ ] **Step 1: Write canonicalization tests**

Cover `user_name -> profile.name`, `user_sport -> profile.sport`, `preferred_tone -> preferences.tone`, stable flexible keys, Unicode/whitespace normalization, wildcard rejection, and empty-value rejection:

```ts
expect(
  canonicalizeKnowledgeCandidate({
    key: " User Sport ",
    value: "Tennis",
    category: "sport",
  }),
).toEqual({
  destination: "profile",
  field: "sport",
  key: "user_sport",
  value: "Tennis",
  category: "sport",
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `bunx vitest run src/lib/ai/memory-canonicalization.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the canonicalizer**

Define:

```ts
export type CanonicalKnowledgeCandidate =
  | { destination: "profile"; field: "name" | "sport" | "goal" | "experience"; key: string; value: string; category: string }
  | { destination: "preferences"; field: "tone" | "mode" | "language"; key: string; value: string; category: string }
  | { destination: "memory"; key: string; value: string; category: string };

export function canonicalizeKnowledgeCandidate(
  candidate: { key: string; value: string; category: string },
): CanonicalKnowledgeCandidate;
```

Use a closed alias map for profile/preferences. For flexible memory keys, normalize to lowercase ASCII snake case, collapse separators, require 3-80 characters, and reject `*`, category-only keys, and deletion-like phrases.

- [ ] **Step 4: Run focused tests**

Run: `bunx vitest run src/lib/ai/memory-canonicalization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit canonicalization**

```bash
git add src/lib/ai/memory-canonicalization.ts src/lib/ai/memory-canonicalization.test.ts
git commit -m "feat(ai): canonicalize durable knowledge"
```

### Task 3: Implement the durable fact service

**Files:**
- Create: `src/lib/ai/memory-facts.ts`
- Modify: `src/lib/ai/memory-facts.test.ts`

**Interfaces:**
- Consumes Prisma fields from Task 1 and canonicalization from Task 2.
- Produces `recallFacts`, `rememberFact`, `reviseFact`, `forgetFact`, and `invalidateFactCache`.

- [ ] **Step 1: Expand failing tests for the service contract**

Add tests for user scoping, exact active target, expiry, ranking, cache invalidation, revision creation, idempotent `dedupeKey`, conflict update, and soft forgetting. Assert no query ever ranks rows before applying `userId` and `status`.

- [ ] **Step 2: Run tests and verify failures**

Run: `bunx vitest run src/lib/ai/memory-facts.test.ts`

Expected: FAIL for unimplemented exports.

- [ ] **Step 3: Implement service types and bounded recall**

Use these public interfaces:

```ts
export type RecalledFact = {
  id: string;
  key: string;
  content: string;
  category: string;
  origin: "EXPLICIT" | "INFERRED" | "CONFIRMED" | "MIGRATED";
  confidence: number;
  observedAt: Date;
  updatedAt: Date;
};

export async function recallFacts(input: {
  userId: string;
  query: string;
  categories?: string[];
  limit?: number;
  now?: Date;
}): Promise<{ facts: RecalledFact[]; degraded: boolean }>;
```

Load a cached, bounded active fact snapshot keyed by `userId` and a 30-second TTL. Rank locally using normalized query-token overlap, category match, origin weight, confidence, and recency. Clamp `limit` to 1-8. Never return raw revision or source identifiers to the model prompt.

- [ ] **Step 4: Implement transactional mutations**

Use exact interfaces:

```ts
export async function rememberFact(input: FactMutationInput): Promise<FactMutationResult>;
export async function reviseFact(input: FactMutationInput & { factId: string }): Promise<FactMutationResult>;
export async function forgetFact(input: { userId: string; factId: string; sourceMessageId: string; dedupeKey: string }): Promise<FactMutationResult>;
```

Each successful mutation uses one Prisma transaction to lock/resolve the exact user-owned row, create one `MemoryRevision`, update current state, and invalidate cache only after commit. Duplicate `dedupeKey` returns the prior logical result without a second mutation.

- [ ] **Step 5: Run service tests**

Run: `bunx vitest run src/lib/ai/memory-facts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the service**

```bash
git add src/lib/ai/memory-facts.ts src/lib/ai/memory-facts.test.ts
git commit -m "feat(ai): add durable fact service"
```

### Task 4: Refactor memory tools over the service

**Files:**
- Modify: `src/lib/ai/tools/memory.ts`
- Modify: `src/lib/ai/tools/memory.test.ts`
- Modify: `src/lib/ai/tools/user-context.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`

**Interfaces:**
- Consumes Task 3 service functions.
- Preserves `createMemoryTools(userId, options)` for orchestrator compatibility while replacing internal Prisma writes.

- [ ] **Step 1: Write failing adapter tests**

Assert:

- `recallFacts` returns only bounded service projections;
- `rememberFact` cannot accept a model-selected user id or source id;
- `reviseFact` requires a server-resolved fact id;
- `forgetFact` has an empty model schema and uses the server-resolved target;
- sensitive writes create approval rather than a direct fact mutation;
- tool errors return content-free status codes and use the project logger.

- [ ] **Step 2: Run focused tool tests**

Run: `bunx vitest run src/lib/ai/tools/memory.test.ts src/lib/ai/orchestrator.test.ts`

Expected: FAIL on the new contracts.

- [ ] **Step 3: Replace direct Prisma access with service calls**

Return this tool inventory from `createMemoryTools` while keeping temporary aliases for legacy stored traces during rollout:

```ts
{
  recallFacts,
  rememberFact,
  reviseFact,
  requestMemoryApproval,
  resolveMemoryApproval,
  forgetFact,
}
```

Accept exact mutation targets and source message ids only through closure options. Use `createLogger("ai")`; remove production `console.error` calls from the modified memory path.

- [ ] **Step 4: Route profile and preference writes canonically**

Extract shared profile/preference mutation functions from `createUserContextTools` so the consolidator and tools use the same validation, cache invalidation, and Clerk best-effort sync. Do not infer interaction settings; require an explicit candidate origin.

- [ ] **Step 5: Run focused tests**

Run: `bunx vitest run src/lib/ai/tools/memory.test.ts src/lib/ai/orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit adapters**

```bash
git add src/lib/ai/tools/memory.ts src/lib/ai/tools/memory.test.ts src/lib/ai/tools/user-context.ts src/lib/ai/orchestrator.test.ts
git commit -m "refactor(ai): route memory tools through fact service"
```

### Task 5: Route user controls and maintenance through the fact service

**Files:**
- Modify: `src/lib/coaching-context.ts`
- Modify: `src/app/api/coaching-context/route.ts`
- Modify: `src/app/api/coaching-context/route.test.ts`
- Modify: `src/app/api/coaching-context/memories/[memoryId]/route.ts`
- Modify: `src/app/api/coaching-context/memories/[memoryId]/route.test.ts`
- Modify: `src/lib/ai/memory-target.ts`
- Modify: `src/lib/ai/memory-target.test.ts`
- Modify: `src/lib/maintenance/memory-consolidation.ts`
- Modify: `src/lib/maintenance/memory-consolidation.test.ts`

**Interfaces:**
- Consumes Task 3 service functions.
- Preserves existing coaching-context HTTP response shapes while enforcing active-state and revision semantics.

- [ ] **Step 1: Write failing API and maintenance tests**

Assert list responses exclude expired, superseded, and deleted facts; PATCH creates a revision through `reviseFact`; DELETE performs exact soft forgetting through `forgetFact`; delete idempotency returns the existing API success shape; target resolution searches only active user-owned facts; and maintenance ignores inactive facts.

- [ ] **Step 2: Run the focused tests**

```bash
bunx vitest run src/app/api/coaching-context/route.test.ts 'src/app/api/coaching-context/memories/[memoryId]/route.test.ts' src/lib/ai/memory-target.test.ts src/lib/maintenance/memory-consolidation.test.ts
```

Expected: FAIL because the routes and maintenance code still access raw rows directly.

- [ ] **Step 3: Replace direct writes and hard deletion**

Keep authentication and JSON contracts unchanged. Resolve each memory id with `userId` and active status, call the fact service with a server-created dedupe key, and project only current fact fields. Do not return revision rows, provenance ids, or sensitivity internals from existing endpoints.

- [ ] **Step 4: Update target resolution and maintenance reads**

Use active, non-expired fact snapshots from the service. Preserve the existing exact-delete intent safeguards and do not broaden natural-language matching.

- [ ] **Step 5: Run tests and commit**

```bash
bunx vitest run src/app/api/coaching-context/route.test.ts 'src/app/api/coaching-context/memories/[memoryId]/route.test.ts' src/lib/ai/memory-target.test.ts src/lib/maintenance/memory-consolidation.test.ts
git add src/lib/coaching-context.ts src/app/api/coaching-context/route.ts src/app/api/coaching-context/route.test.ts 'src/app/api/coaching-context/memories/[memoryId]/route.ts' 'src/app/api/coaching-context/memories/[memoryId]/route.test.ts' src/lib/ai/memory-target.ts src/lib/ai/memory-target.test.ts src/lib/maintenance/memory-consolidation.ts src/lib/maintenance/memory-consolidation.test.ts
git commit -m "refactor(ai): enforce fact lifecycle in user controls"
```

### Task 6: Replace optional agentic extraction with shared consolidation

**Files:**
- Create: `src/lib/ai/memory-consolidator.ts`
- Create: `src/lib/ai/memory-consolidator.test.ts`
- Modify: `src/lib/ai/memory-extractor.ts`
- Modify: `src/lib/ai/memory-extractor.test.ts`
- Modify: `src/lib/ai/memory-approval.ts`
- Modify: `src/lib/ai/memory-approval.test.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`
- Modify: `src/app/api/chat/route.test.ts`

**Interfaces:**
- Consumes canonical routing and fact mutations from Tasks 2-4.
- Produces `consolidateTurnMemory(input): Promise<MemoryConsolidationReport>`.

- [ ] **Step 1: Write failing candidate and scheduling tests**

Cover ordinary fact creation, profile routing, explicit preference routing, assistant-claim rejection, transient-detail rejection, low-confidence rejection, duplicate source id, unpresented sensitive candidate creation, presentation attribution, expiry, thread isolation, and identical scheduling in legacy and agentic planner modes.

```ts
expect(
  consolidateTurnMemory({
    userId: "user-1",
    inboundMessageId: "inbound-1",
    userText: "Mi alleno ogni martedì sera",
    assistantText: "Perfetto.",
  }),
).resolves.toMatchObject({ persisted: 1, approvalsCreated: 0 });
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
bunx vitest run src/lib/ai/memory-consolidator.test.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts
```

Expected: FAIL because agentic persistence currently skips extraction.

- [ ] **Step 3: Implement structured candidate extraction**

Define a strict Zod output with `key`, `value`, `category`, `confidence`, `sensitivity`, `origin`, and `explicitSetting`. Extract only from the user text; assistant text may supply disambiguating conversational context but cannot be the source of a fact. Keep model output temperature 0, bounded tokens, usage accounting, and content-free logs.

- [ ] **Step 4: Implement idempotent consolidation**

Export:

```ts
export type MemoryConsolidationReport = {
  considered: number;
  persisted: number;
  approvalsCreated: number;
  rejected: number;
};

export async function consolidateTurnMemory(input: {
  userId: string;
  inboundMessageId: string;
  conversationThreadId?: string;
  userText: string;
  assistantText: string;
}): Promise<MemoryConsolidationReport>;
```

Use `memory:${inboundMessageId}:${canonicalKey}` as the mutation dedupe key. Route profile/preferences/facts through their canonical services. For sensitive candidates, create one unpresented pending approval and no fact. Add `getUnpresentedMemoryApproval` and `markMemoryApprovalPresented`; only a later assistant response linked by shared persistence may become the attributable presentation.

- [ ] **Step 5: Schedule consolidation in shared persistence**

Replace the legacy-only condition in `persistAssistantOutput` with one authenticated completed-turn schedule. Skip guests, invalid recovery metadata, model-comparison responses, deleted messages, and empty user text. Pass the persisted inbound id and thread id. Use the existing `scheduleBackground(waitUntil, task)` helper so streaming never waits.

- [ ] **Step 6: Run focused persistence tests**

Run:

```bash
bunx vitest run src/lib/ai/memory-consolidator.test.ts src/lib/ai/memory-extractor.test.ts src/lib/ai/memory-approval.test.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit consolidation**

```bash
git add src/lib/ai/memory-consolidator.ts src/lib/ai/memory-consolidator.test.ts src/lib/ai/memory-extractor.ts src/lib/ai/memory-extractor.test.ts src/lib/ai/memory-approval.ts src/lib/ai/memory-approval.test.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts
git commit -m "feat(ai): consolidate durable facts after every turn"
```

### Task 7: Document and verify the durable-memory milestone

**Files:**
- Modify: `docs/ai-system.md`
- Test: all files modified in Tasks 1-6

**Interfaces:**
- Produces the stable durable-fact substrate required by the conversation-recall plan.

- [ ] **Step 1: Document the canonical ownership and lifecycle**

Update `docs/ai-system.md` with Profile/Preferences/Memory ownership, required explicit mutations, asynchronous consolidation, provenance, expiry, and the fact recall latency contract.

- [ ] **Step 2: Run milestone verification**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/ai/memory-canonicalization.test.ts src/lib/ai/memory-facts.test.ts src/lib/ai/tools/memory.test.ts src/lib/ai/memory-consolidator.test.ts src/lib/ai/memory-extractor.test.ts src/lib/ai/memory-approval.test.ts src/app/api/coaching-context/route.test.ts 'src/app/api/coaching-context/memories/[memoryId]/route.test.ts' src/lib/ai/memory-target.test.ts src/lib/maintenance/memory-consolidation.test.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts
bun run typecheck
bunx biome check prisma/schema.prisma src/lib/ai/memory-canonicalization.ts src/lib/ai/memory-facts.ts src/lib/ai/tools/memory.ts src/lib/ai/tools/user-context.ts src/lib/ai/memory-consolidator.ts src/lib/ai/memory-extractor.ts src/lib/ai/memory-approval.ts src/lib/coaching-context.ts src/app/api/coaching-context/route.ts 'src/app/api/coaching-context/memories/[memoryId]/route.ts' src/lib/ai/memory-target.ts src/lib/maintenance/memory-consolidation.ts src/lib/channel-flow/persistence.ts docs/ai-system.md
git diff --check
```

Expected: all commands pass. If global lint still fails only on unrelated generated `.impeccable/hook.cache.json`, leave it unchanged and report it separately.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/ai-system.md
git commit -m "docs(ai): document durable fact memory"
```
