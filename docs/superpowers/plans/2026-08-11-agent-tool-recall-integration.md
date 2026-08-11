# Agent Tool and Recall Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Integrate proactive fact and conversation recall into every authenticated turn, make capability decisions independent, instrument the tool funnel, and roll the system out safely across all channels.

**Architecture:** A local recall planner preloads bounded relevant facts and optional current-thread-first evidence in parallel with normal context loading. The agent receives only selected context plus eligible deep-recall tools. Capability votes are accepted independently, a shared fail-closed release decision propagates through persistence and recovery, and privacy-safe telemetry separates planning, execution, result quality, and answer utilization.

**Tech Stack:** TypeScript, Next.js 16, Vercel AI SDK, Prisma, PostHog, Vitest, browser verification, Bun.

## Global Constraints

- Start only after the durable-fact and conversation-recall plans pass.
- Add no LLM request to baseline memory planning.
- Guests receive neither durable facts nor cross-session conversation recall.
- Inject selected facts and evidence, never the complete memory store.
- One uncertain capability cannot discard confident decisions for other capabilities.
- Required explicit memory actions cannot depend on optional model initiative.
- Prepared comparisons expose no persistent writes or executable recall tools.
- Recovery accepts only complete matching persisted release metadata.
- Telemetry contains no fact values, queries, excerpts, raw URLs, or source ids.
- Preserve the 100/200/400 ms hard incremental P95 ceilings.

---

## File map

- src/lib/ai/memory-recall-release.ts: shared off, shadow, or active decision.
- src/lib/ai/recall-planner.ts: no-LLM turn recall plan.
- src/lib/ai/recall-context.ts: parallel retrieval and prompt formatting.
- src/lib/ai/capability-arbitration.ts: independent capability votes.
- src/lib/ai/tool-policy.ts: tool classes, prerequisites, budgets, and effects.
- src/lib/ai/tool-outcomes.ts: privacy-safe considered-to-utilized funnel.
- src/lib/ai/orchestrator.ts: recall and tool integration.
- src/lib/channel-flow and src/lib/rate-limit: persistence and recovery propagation.
- src/lib/ai/capability-usage.ts and chat components: recall indicator.
- src/lib/benchmark/memory-recall.ts: offline benchmark.
- docs/ai-system.md and CHANGELOG.md: final operations and release notes.

---

### Task 1: Add one shared fail-closed release decision

**Files:**
- Create: src/lib/ai/memory-recall-release.ts
- Create: src/lib/ai/memory-recall-release.test.ts
- Modify: src/lib/channel-flow/types.ts

**Interfaces:**
- Produces MemoryRecallMode and resolveMemoryRecallMode.
- Produces one immutable MemoryRecallDecision propagated by later tasks.

- [ ] **Step 1: Write failing release tests**

Cover default off, explicit shadow/active environment modes, guest denial, memory-disabled denial, malformed mode, and immutable results.

~~~ts
expect(
  await resolveMemoryRecallMode({
    userId: "user-1",
    isGuest: false,
    memoryEnabled: true,
  }),
).toEqual(Object.freeze({ mode: "off", reason: "default_off" }));
~~~

- [ ] **Step 2: Run the test**

Run: bunx vitest run src/lib/ai/memory-recall-release.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the closed decision**

~~~ts
export type MemoryRecallMode = "off" | "shadow" | "active";
export type MemoryRecallDecision = Readonly<{
  mode: MemoryRecallMode;
  reason: string;
}>;

export async function resolveMemoryRecallMode(input: {
  userId: string;
  isGuest: boolean;
  memoryEnabled: boolean;
}): Promise<MemoryRecallDecision>;
~~~

Read AI_MEMORY_RECALL_MODE and accept only the closed enum. Guest, disabled-memory, missing, invalid, or evaluation failure returns off. Do not query PostHog on every turn in the first rollout.

- [ ] **Step 4: Propagate the type through channel-flow admission**

Allow an optional decision only at admission boundaries. Require a concrete decision once execution begins. Persistence and recovery must not reread process state.

- [ ] **Step 5: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/memory-recall-release.test.ts
git add src/lib/ai/memory-recall-release.ts src/lib/ai/memory-recall-release.test.ts src/lib/channel-flow/types.ts
git commit -m "feat(ai): add memory recall release decision"
~~~

### Task 2: Implement the no-LLM recall planner

**Files:**
- Create: src/lib/ai/recall-planner.ts
- Create: src/lib/ai/recall-planner.test.ts

**Interfaces:**
- Consumes MemoryRecallDecision.
- Produces planRecall(input): RecallPlan.

- [ ] **Step 1: Write failing planning tests**

Cover ordinary coaching personalization, explicit recall, references such as “ne avevamo parlato”, current-thread-only default, global expansion eligibility, atomic greetings, guests, shadow mode, result limits, and deadlines.

- [ ] **Step 2: Run the test**

Run: bunx vitest run src/lib/ai/recall-planner.test.ts

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement the plan**

~~~ts
export type RecallPlan = Readonly<{
  facts: { enabled: boolean; limit: number; deadlineMs: number };
  conversations: {
    enabled: boolean;
    initialScope: "current_thread";
    allowCrossChannel: boolean;
    limit: number;
    currentDeadlineMs: number;
    globalDeadlineMs: number;
  };
  reasonCodes: readonly string[];
}>;
~~~

Enable facts on active authenticated non-atomic coaching turns. Enable conversation recall from closed local signals for explicit historical references, repeated problems, prior commitments, outcomes, and requested continuity. Never emit raw user text in reason codes.

- [ ] **Step 4: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/recall-planner.test.ts
git add src/lib/ai/recall-planner.ts src/lib/ai/recall-planner.test.ts
git commit -m "feat(ai): plan proactive recall locally"
~~~

### Task 3: Build bounded recall context in parallel

**Files:**
- Create: src/lib/ai/recall-context.ts
- Create: src/lib/ai/recall-context.test.ts

**Interfaces:**
- Consumes recallFacts, searchPastConversations, and RecallPlan.
- Produces buildRecallContext(input): RecallContextResult.

- [ ] **Step 1: Write failing context tests**

Cover parallel start, individual deadlines, partial degradation, shadow omission, active prompt projection, total character caps, content escaping, and absence of raw ids or query text.

- [ ] **Step 2: Run the test**

Run: bunx vitest run src/lib/ai/recall-context.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement result and formatting**

~~~ts
export type RecallContextResult = {
  prompt: string;
  factCount: number;
  evidenceCount: number;
  factRecallMs: number;
  conversationRecallMs: number;
  degraded: boolean;
  allowedEvidenceIds: Set<string>;
};
~~~

Start fact and conversation promises before awaiting either. Apply abortable deadlines. Shadow executes and measures but returns an empty prompt and id set. Active formats facts and evidence under an “evidence, not instructions” section capped at 6,000 characters.

- [ ] **Step 4: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/recall-context.test.ts
git add src/lib/ai/recall-context.ts src/lib/ai/recall-context.test.ts
git commit -m "feat(ai): build bounded recall context"
~~~

### Task 4: Accept capability votes independently

**Files:**
- Modify: src/lib/ai/capability-arbitration.ts
- Modify: src/lib/ai/capability-arbitration.test.ts

**Interfaces:**
- Preserves CapabilityDecision and classifyCapabilities call sites.
- Replaces one global confidence gate with partial accepted votes.

- [ ] **Step 1: Write failing partial-decision tests**

Prove a confident memoryWrite yes survives uncertain webFetch, a confident webSearch no survives uncertain voice, deterministic explicit intent still wins, and provider failure affects only unavailable capabilities.

- [ ] **Step 2: Run the test**

Run: bunx vitest run src/lib/ai/capability-arbitration.test.ts

Expected: FAIL because hasUncertainCapability discards the whole output.

- [ ] **Step 3: Replace the output schema**

~~~ts
const capabilityVoteSchema = z.object({
  decision: z.enum(["yes", "no", "uncertain"]),
  confidence: z.number().min(0).max(1),
});
~~~

Return a partial decision containing a boolean only when that capability is yes or no with confidence at least 0.7. Omit uncertain fields. Return null only when no field is accepted.

- [ ] **Step 4: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/capability-arbitration.test.ts
git add src/lib/ai/capability-arbitration.ts src/lib/ai/capability-arbitration.test.ts
git commit -m "fix(ai): isolate capability uncertainty"
~~~

### Task 5: Add tool policy and privacy-safe outcomes

**Files:**
- Create: src/lib/ai/tool-policy.ts
- Create: src/lib/ai/tool-policy.test.ts
- Create: src/lib/ai/tool-outcomes.ts
- Create: src/lib/ai/tool-outcomes.test.ts
- Modify: src/lib/ai/cost-calculator.ts
- Modify: src/lib/ai/telemetry.ts

**Interfaces:**
- Produces ToolPolicy, resolveToolPolicy, ToolOutcomeTracker, and aggregate metrics.

- [ ] **Step 1: Write failing tests**

Cover four tool classes, search-before-fetch, active recall ids, at-most-once mutations, guest denial, per-tool call budgets, successful/useful results, answer utilization, and argument/result redaction.

- [ ] **Step 2: Run tests**

Run: bunx vitest run src/lib/ai/tool-policy.test.ts src/lib/ai/tool-outcomes.test.ts src/lib/ai/telemetry.test.ts

Expected: FAIL because policy and tracker modules do not exist.

- [ ] **Step 3: Implement the closed registry**

~~~ts
export type ToolClass = "required" | "read" | "mutation" | "proposal";
export type ToolPolicy = Readonly<{
  name: string;
  class: ToolClass;
  maxCalls: number;
  requires: readonly string[];
  privacy: "public" | "private" | "sensitive";
  sideEffect: "none" | "user_data" | "proposal";
}>;
~~~

Unknown tools fail closed. Resolve eligibility from immutable turn, release, guest, entitlement, and target decisions.

- [ ] **Step 4: Implement aggregate outcome tracking**

~~~ts
export type ToolOutcomeSummary = {
  considered: number;
  allowed: number;
  called: number;
  succeeded: number;
  useful: number;
  utilized: number;
};
~~~

Track allowlisted tool names, booleans, counts, and timings only. Determine useful from tool result schemas. Determine utilized from a subsequent model step consuming the result. Add only aggregate counts to AIMetrics and PostHog.

- [ ] **Step 5: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/tool-policy.test.ts src/lib/ai/tool-outcomes.test.ts src/lib/ai/telemetry.test.ts
git add src/lib/ai/tool-policy.ts src/lib/ai/tool-policy.test.ts src/lib/ai/tool-outcomes.ts src/lib/ai/tool-outcomes.test.ts src/lib/ai/cost-calculator.ts src/lib/ai/telemetry.ts
git commit -m "feat(ai): instrument tool decision outcomes"
~~~

### Task 6: Integrate recall and policy into orchestration

**Files:**
- Modify: src/lib/ai/orchestrator.ts
- Modify: src/lib/ai/orchestrator.test.ts
- Modify: src/lib/ai/tools/memory.ts
- Modify: src/lib/ai/tools/conversation-recall.ts

**Interfaces:**
- Consumes Tasks 1-5 and both prerequisite plans.
- Produces active/shadow recall in streamChat and prepareChatTurn.

- [ ] **Step 1: Write failing orchestration tests**

Cover proactive facts despite a false memoryRead vote, removal of all-memory injection, current-thread evidence before generation, policy-gated global expansion, shadow measurement without injection, server-owned tool context, required explicit mutations, forced presentation of one unpresented sensitive approval, compact atomic turns, guest denial, comparison denial, recall failure, and parallel context start.

- [ ] **Step 2: Run focused tests**

Run: bunx vitest run src/lib/ai/orchestrator.test.ts

Expected: FAIL on the new recall behavior.

- [ ] **Step 3: Integrate recall**

Resolve MemoryRecallDecision once, call planRecall, and start buildRecallContext alongside existing thread and prompt work. Replace formatMemoriesForPrompt only in active mode; keep the legacy formatter when mode is off.

- [ ] **Step 4: Integrate tool policy and tracking**

Build eligible tools from resolveToolPolicy. Wrap execution with ToolOutcomeTracker and existing timing. Pass the same policy state through prepareStep to enforce prerequisites and call limits. When one attributable unpresented sensitive approval exists, force a `presentMemoryApproval` step, instruct the response to ask naturally, and let shared persistence link the resulting assistant message before any later reply can resolve it.

- [ ] **Step 5: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/orchestrator.test.ts
git add src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/lib/ai/tools/memory.ts src/lib/ai/tools/conversation-recall.ts
git commit -m "feat(ai): integrate proactive memory recall"
~~~

### Task 7: Propagate recall through channels and recovery

**Files:**
- Modify: src/lib/channel-flow/types.ts
- Modify: src/lib/channel-flow/run.ts
- Modify: src/lib/channel-flow/run.test.ts
- Modify: src/lib/channel-flow/persistence.ts
- Modify: src/lib/channel-flow/persistence.test.ts
- Modify: src/lib/rate-limit/reservations.ts
- Modify: src/lib/rate-limit/reservations.test.ts
- Modify: src/app/api/chat/route.test.ts
- Modify: src/app/api/webhooks/telegram/route.test.ts
- Modify: src/app/api/webhooks/whatsapp/route.test.ts
- Modify: relevant files under src/lib/model-experiments/

**Interfaces:**
- Persists mode, counts, timings, and degraded status.
- Recovery consumes the persisted decision and never rereads environment.

- [ ] **Step 1: Write failing propagation tests**

Cover Web, Telegram, WhatsApp, voice-first, replay, valid legacy, valid active, missing mode, malformed mode, mismatch, comparisons, and guests.

- [ ] **Step 2: Run focused tests**

~~~bash
bunx vitest run src/lib/channel-flow/run.test.ts src/lib/channel-flow/persistence.test.ts src/lib/rate-limit/reservations.test.ts src/app/api/chat/route.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts src/lib/model-experiments
~~~

Expected: FAIL on missing recall propagation.

- [ ] **Step 3: Persist sanitized metadata**

Store mode, reason code, fact/evidence counts, bounded timings, and degraded boolean. Never store queries, values, excerpts, evidence ids, or fact ids.

- [ ] **Step 4: Harden recovery**

Valid legacy metadata has no recall payload. Valid new metadata has one complete closed recall decision matching planner mode. Missing, malformed, mixed, or unexpected metadata fails closed and cannot schedule consolidation or indexing.

- [ ] **Step 5: Run tests and commit**

~~~bash
bunx vitest run src/lib/channel-flow/run.test.ts src/lib/channel-flow/persistence.test.ts src/lib/rate-limit/reservations.test.ts src/app/api/chat/route.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts src/lib/model-experiments
git add src/lib/channel-flow src/lib/rate-limit/reservations.ts src/lib/rate-limit/reservations.test.ts src/app/api/chat/route.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts src/lib/model-experiments
git commit -m "fix(ai): preserve recall decisions through recovery"
~~~

### Task 8: Add the recall indicator

**Files:**
- Modify: src/lib/ai/capability-usage.ts
- Modify: src/lib/ai/capability-usage.test.ts
- Modify: src/app/(chat)/components/MessageList.tsx
- Modify: src/app/(chat)/components/MessageList.behavior.test.tsx
- Modify: src/app/(chat)/chat/[id]/chat-conversation-client.tsx

**Interfaces:**
- Adds allowlisted usage value recall.

- [ ] **Step 1: Write failing tests**

Assert recall appears only when active facts or evidence contributed, remains absent for shadow/degraded-empty turns, is non-interactive, and survives persisted parsing.

- [ ] **Step 2: Run tests**

Run: bunx vitest run src/lib/ai/capability-usage.test.ts 'src/app/(chat)/components/MessageList.behavior.test.tsx'

Expected: FAIL because recall is not allowlisted.

- [ ] **Step 3: Implement the indicator**

Add recall to the closed values and render the Italian label “Ricordo” with an existing Lucide icon. Use the current indicator styles and no click handler, payload, source, or fact content.

- [ ] **Step 4: Run tests and commit**

~~~bash
bunx vitest run src/lib/ai/capability-usage.test.ts 'src/app/(chat)/components/MessageList.behavior.test.tsx'
git add src/lib/ai/capability-usage.ts src/lib/ai/capability-usage.test.ts 'src/app/(chat)/components/MessageList.tsx' 'src/app/(chat)/components/MessageList.behavior.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx'
git commit -m "feat(chat): show discreet recall usage"
~~~

### Task 9: Add the offline benchmark

**Files:**
- Create: src/lib/benchmark/memory-recall.ts
- Create: src/lib/benchmark/memory-recall.test.ts
- Create: src/lib/benchmark/fixtures/memory-recall.json
- Create: scripts/run-memory-recall-benchmark.ts
- Modify: package.json

**Interfaces:**
- Produces bun run benchmark:memory-recall.

- [ ] **Step 1: Write failing scorer tests**

Cover useful-action recall, unnecessary-action rate, fact precision/recall, duplicate rate, conflict accuracy, evidence relevance, unsupported-memory claims, latency percentiles, and cost aggregation.

- [ ] **Step 2: Run the test**

Run: bunx vitest run src/lib/benchmark/memory-recall.test.ts

Expected: FAIL because the benchmark does not exist.

- [ ] **Step 3: Implement fixtures and scoring**

Add at least 30 fictionalized/anonymized Italian scenarios covering explicit and implicit recall, no-recall controls, profile routing, preferences, ordinary and sensitive facts, conflicts, exact forgetting, current-thread recall, global expansion, and prompt injection.

- [ ] **Step 4: Implement the guarded CLI**

Default to mock/offline execution. Require --allow-db-read for database-backed evaluation and --allow-db-mutation for any setup write. Report period, fixture version, filters, source, and metric definitions.

- [ ] **Step 5: Run tests and commit**

~~~bash
bunx vitest run src/lib/benchmark/memory-recall.test.ts
git add src/lib/benchmark/memory-recall.ts src/lib/benchmark/memory-recall.test.ts src/lib/benchmark/fixtures/memory-recall.json scripts/run-memory-recall-benchmark.ts package.json
git commit -m "test(ai): benchmark memory and tool behavior"
~~~

### Task 10: Final documentation and verification

**Files:**
- Modify: docs/ai-system.md
- Modify: CHANGELOG.md

**Interfaces:**
- Completes the approved design and documents release/rollback operations.

- [ ] **Step 1: Update documentation**

Document two-layer memory, recall planning, evidence packets, independent capability votes, required mutations, modes, recovery, metric definitions, backfill, benchmark, rollback, and privacy.

- [ ] **Step 2: Run every focused suite from all three plans**

Expected: all focused memory, recall, tool, channel, recovery, comparison, benchmark, and UI tests pass.

- [ ] **Step 3: Run repository gates**

~~~bash
bunx prisma validate
bunx prisma generate
bun run typecheck
bun run test
bun run lint
git diff --check
~~~

Expected: project-owned checks pass. Report unrelated generated-cache lint separately without changing it.

- [ ] **Step 4: Run the benchmark**

Run: bun run benchmark:memory-recall

Expected: all fixtures valid and the report defines period, version, filters, source, latency, cost, and quality metrics.

- [ ] **Step 5: Verify a real chat route**

Use the project Next.js runtime verification workflow. Confirm “Ricordo” is visible only when active recall contributed, is non-interactive, and prose does not narrate tools. Verify a no-recall turn has no indicator.

- [ ] **Step 6: Verify migrations on an ephemeral Neon branch**

Run the integration workflow so both migrations apply on an ephemeral branch. Confirm backfills default to dry-run and never target Production automatically.

- [ ] **Step 7: Commit final documentation**

~~~bash
git add docs/ai-system.md CHANGELOG.md
git commit -m "docs(changelog): record proactive memory recall"
~~~
