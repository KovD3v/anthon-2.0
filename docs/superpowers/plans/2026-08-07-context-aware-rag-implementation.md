# Context-aware RAG Strategy Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated Anthon turns retrieve curated coaching strategies consistently from bounded conversation context, expose truthful `ragAttempted` telemetry, and protect the behavior with deterministic unit, integration, and regression tests.

**Architecture:** Add a decision object in `rag.ts` that separates selection from the vector-search query and accepts only the current message plus a bounded prior focus. Both normal streaming and paired-model preparation consume that decision, carry `ragAttempted` beside `ragUsed`, and inject a stronger RAG prompt contract only when chunks are usable. Persist the new nullable database fields and emit the new scalar to PostHog; validate the real pgvector boundary on disposable Neon instead of asserting nondeterministic model prose in a browser.

**Tech Stack:** TypeScript, Vitest, Playwright regression suite, Prisma/PostgreSQL/pgvector on ephemeral Neon, Vercel AI SDK, PostHog.

## Global Constraints

- Guest chat continues to bypass RAG.
- Live web-search requests continue to bypass RAG.
- Acute safety signals reject retrieval before database or classifier work; ordinary anxiety and performance pressure do not.
- The retrieval query uses only the current message and the immediately relevant prior user/assistant turn, capped at 1,600 characters.
- At most one embedding and one vector search run per turn.
- Restricted families such as hypnosis, auto-hypnosis, anchoring, Swish, Timeline, and NLP-derived methods are never proposed autonomously; an explicit request remains eligible with safety restrictions.
- Historical `ragAttempted` values remain `null`; every newly generated turn emits and persists an explicit boolean.
- PostHog receives no query text, message content, chunk content, document identifier, title, or similarity score.
- Browser guest-chat regression remains green; RAG retrieval correctness is tested at the authenticated orchestrator and real pgvector boundaries because the repository has no deterministic Clerk test identity.

---

### Task 1: Context-aware retrieval decision

**Files:**
- Modify: `src/lib/ai/rag.ts`
- Modify: `src/lib/ai/rag.test.ts`
- Modify: `src/lib/ai/constants.ts`

**Interfaces:**
- Produces: `RagDecisionContextMessage = { role: "user" | "assistant"; content: string }`
- Produces: `RagRetrievalDecision = { shouldRetrieve: boolean; query: string; reason: string }`
- Produces: `decideRagRetrieval(userMessage: string, options?: { userId?: string; conversationContext?: RagDecisionContextMessage[] }): Promise<RagRetrievalDecision>`
- Preserves: `shouldUseRag(userMessage, options): Promise<boolean>` as a compatibility wrapper over `decideRagRetrieval`.

- [ ] **Step 1: Write failing deterministic-route tests**

Add literal expectations proving that `Conosci tecniche di respirazione?` selects retrieval without calling the classifier, that an explicit auto-hypnosis request remains eligible, and that a greeting or live-news request remains rejected.

```ts
expect(await decideRagRetrieval("Conosci tecniche di respirazione?")).toEqual({
  shouldRetrieve: true,
  query: "Conosci tecniche di respirazione?",
  reason: "deterministic_strategy_signal",
});
expect(mocks.generateText).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bunx vitest run src/lib/ai/rag.test.ts`

Expected: FAIL because `decideRagRetrieval` and normalized strategy signals do not exist.

- [ ] **Step 3: Write failing bounded-context and safety tests**

Cover `Sì` after the immediately preceding autogenic-training request and assistant invitation, exclusion of older unrelated turns from the query, the 1,600-character cap, autonomous classifier selection for a concrete non-keyword coaching moment, and acute distress rejecting before document-count/classifier calls.

```ts
const decision = await decideRagRetrieval("Sì", {
  conversationContext: [
    { role: "user", content: "Vorrei provare il training autogeno prima della gara" },
    { role: "assistant", content: "Vuoi che ti guidi in una pratica breve?" },
  ],
});
expect(decision.shouldRetrieve).toBe(true);
expect(decision.query).toContain("training autogeno");
expect(decision.query).toContain("Sì");
```

- [ ] **Step 4: Implement the minimal decision boundary**

Normalize strategy families with stem-aware regular expressions, build a bounded focus from the last complete user/assistant turn, reject acute safety and web-search intents first, and use the existing classifier only for remaining concrete coaching opportunities. Cache classifier decisions by the normalized bounded query.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `bunx vitest run src/lib/ai/rag.test.ts`

Expected: PASS.

### Task 2: Orchestrator use, safety contract, and attempted state

**Files:**
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`

**Interfaces:**
- Consumes: `decideRagRetrieval(...)` from Task 1.
- Produces: `ragAttempted: boolean` on streamed metrics, `PreparedChatTurn`, and paired generation metrics.
- Preserves: `ragUsed === true` only when `ragChunksCount > 0` and RAG context is injected.

- [ ] **Step 1: Write failing orchestration tests**

Test three literal states independently: not selected (`false/false/0`), selected but empty or failed (`true/false/0`), and selected with chunks (`true/true/n`). Assert the vector lookup receives the decision query exactly once.

```ts
expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
  "google/gemini-test",
  expect.any(Number),
  expect.objectContaining({
    ragAttempted: true,
    ragUsed: false,
    ragChunksCount: 0,
  }),
);
```

- [ ] **Step 2: Run orchestrator tests and verify RED**

Run: `bunx vitest run src/lib/ai/orchestrator.test.ts`

Expected: FAIL because bounded context and `ragAttempted` are not propagated.

- [ ] **Step 3: Write failing prompt-contract tests**

When chunks exist, assert behavior clauses for preferred strategy use, `Usala quando`, `Prima verifica`, `Non usarla`, one next step, one observable check, safety precedence, and the restricted-family autonomy guard. When no chunk exists, assert both the RAG policy and RAG context sections are absent.

- [ ] **Step 4: Implement orchestration and prompt changes**

Await the existing conversation-history promise inside the RAG branch, project only user/assistant string messages into the decision input, execute `getRagContext(decision.query)` once, set `ragAttempted` immediately before the lookup, and pass all three fields through finish handling and paired preparation.

- [ ] **Step 5: Run orchestrator tests and verify GREEN**

Run: `bunx vitest run src/lib/ai/orchestrator.test.ts`

Expected: PASS.

### Task 3: Metrics, persistence, schema, and privacy-safe analytics

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260807180000_add_rag_attempted/migration.sql`
- Modify: `src/lib/ai/cost-calculator.ts`
- Modify: `src/lib/ai/cost-calculator.test.ts`
- Modify: `src/lib/ai/telemetry.ts`
- Modify: `src/lib/ai/telemetry.test.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/chat/route.test.ts`

**Interfaces:**
- Produces: nullable `Message.ragAttempted` and `MessageMetrics.ragAttempted` columns without a default.
- Produces: `AIMetrics.ragAttempted: boolean` and `FinishResultInput.ragAttempted?: boolean`.
- Produces: `$ai_generation.properties.ragAttempted` as a boolean scalar.

- [ ] **Step 1: Write failing metric and telemetry tests**

Assert `extractAIMetrics` defaults the value to false and preserves true, and assert PostHog receives `ragAttempted` while serialized capture data excludes query, context, title, IDs, and similarity fixtures.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bunx vitest run src/lib/ai/cost-calculator.test.ts src/lib/ai/telemetry.test.ts`

Expected: FAIL because `ragAttempted` is absent.

- [ ] **Step 3: Write failing persistence tests**

Assert both `message.create` and `messageMetrics.create` receive the explicit boolean for skipped, attempted-empty, and successful lookup fixtures. Assert the authenticated chat route forwards it unchanged from `onFinish`.

- [ ] **Step 4: Implement the schema and propagation**

Add nullable columns with `ALTER TABLE ... ADD COLUMN "ragAttempted" BOOLEAN;`, regenerate Prisma, include the field in metric extraction, PostHog allowlist, channel persistence, and authenticated web persistence.

- [ ] **Step 5: Validate schema and run focused tests**

Run: `bunx prisma validate`

Run: `bunx prisma generate`

Run: `bunx vitest run src/lib/ai/cost-calculator.test.ts src/lib/ai/telemetry.test.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts`

Expected: all PASS.

### Task 4: Real retrieval boundary on disposable Neon

**Files:**
- Create: `src/lib/ai/rag.integration.test.ts`

**Interfaces:**
- Consumes: `decideRagRetrieval` and `getRagContext` from Task 1.
- Uses: `TEST_DATABASE_URL` through the existing integration setup and a mocked OpenRouter embedding response only at the external HTTP boundary.

- [ ] **Step 1: Write the integration test**

Create one `RagDocument`, insert a 1,536-dimensional non-zero vector chunk with raw SQL, return the same literal vector from the embedding HTTP mock, and assert that the direct breathing request selects retrieval and returns the seeded strategy context. Add an orthogonal-vector case proving an attempted lookup can return zero usable chunks.

- [ ] **Step 2: Run on ephemeral Neon and verify behavior**

Run: `bun run test:integration -- src/lib/ai/rag.integration.test.ts`

Expected: PASS after Tasks 1–3 and automatic deletion of the temporary Neon branch.

### Task 5: Regression gates and publication

**Files:**
- Modify only if required by type fallout: test fixtures that construct `AIMetrics` directly.

**Interfaces:**
- Preserves the existing browser guest-chat suite and all channel behavior.

- [ ] **Step 1: Run focused AI and persistence tests**

Run: `bunx vitest run src/lib/ai/rag.test.ts src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.test.ts src/lib/ai/telemetry.test.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.test.ts`

- [ ] **Step 2: Run repository gates**

Run: `bun run lint`

Run: `bun run test`

- [ ] **Step 3: Run browser regression**

Run: `bun run test:e2e`

Expected: 7 passed and the desktop-only mobile-launcher variant skipped; the ephemeral Neon branch is deleted.

- [ ] **Step 4: Check the diff**

Run: `git diff --check`

Run: `git status --short`

- [ ] **Step 5: Commit the verified scope**

```bash
git add docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/rag.integration.test.ts src/lib/ai/constants.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.ts src/lib/ai/cost-calculator.test.ts src/lib/ai/telemetry.ts src/lib/ai/telemetry.test.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts src/app/api/chat/route.ts src/app/api/chat/route.test.ts prisma/schema.prisma prisma/migrations/20260807180000_add_rag_attempted/migration.sql
git commit -m "feat(rag): add context-aware strategy retrieval"
```
