# Autonomous AI Capability Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Anthon to decide independently, for each message, which permitted capabilities to use—RAG, web research, memory read/write/delete, routine proposal, user context, and the already-existing voice decision—while keeping safety, permissions, quotas, cost, privacy, and idempotence deterministic.

**Architecture:** Add a structured per-turn capability arbitration layer between intent/context collection and tool construction. The model may select from a bounded capability inventory, then a deterministic policy normalizes that selection against authentication, preferences, plan entitlements, explicit web rules, sensitivity rules, output mode, and tool limits. Agentic mode exposes RAG and web as independent native tools, exposes memory writes through guarded tools, and preserves the current extractor/direct-search path behind a legacy feature flag. Capability use is reduced to safe semantic metadata before persistence and rendered as non-interactive indicators.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vercel AI SDK, Vitest, Prisma/PostgreSQL, Biome, existing web/RAG/memory/routine/voice channel abstractions.

## Global Constraints

- Work only in `/Users/kovd3v/Documents/Projects/anthon-2.0`.
- Preserve the existing user-owned changes in `docs/user-plan-states.md`, `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`, and `docs/superpowers/plans/2026-08-09-routine-runner-focus-mode.md`; do not stage or edit them.
- Use `AI_CAPABILITY_PLANNER_MODE=legacy` as the compatibility path and `AI_CAPABILITY_PLANNER_MODE=agentic` as the new path. The default remains `legacy` until the implementation is verified and the rollout decision is made. The existing `AI_TURN_PLANNER_MODE` remains supported for its current compatibility tests and is not repurposed as the capability rollout switch.
- The model never receives unrestricted database, network, deletion, scheduling, billing, or voice-delivery authority. Server policy is the final authority.
- RAG and web research are independent capabilities and may both be selected in one turn. Do not retain the old `webSearch => no RAG` exclusion in agentic mode.
- Memory reads, ordinary low-risk creates, and ordinary low-risk updates/overwrites may happen silently. A sensitive or high-impact inferred fact must create a pending approval and must not create a `Memory` row before approval.
- Autonomous deletion is limited to one exact memory target when the current request clearly means “forget this”; ambiguous targets must not delete anything and must elicit clarification. Never expose or log raw memory values, raw search queries, approval payloads, internal reasoning, document IDs, or tool arguments in UI telemetry.
- Routine tools may only create a proposal. They must never save, run, archive, or mutate a `Routine` without a separate user action.
- Voice delivery continues to use the existing `decideWebVoiceMode` and `decideVoiceDelivery` hard guards. The capability planner records the resulting mode; it does not bypass user quiet mode, entitlement, provider capacity, quota, cadence, anti-spam, or explicit-text constraints.
- Use test-first changes. For each task, first add a failing focused test, then implement the smallest change that makes it pass, then run the listed focused command and `git diff --check`.
- Use `src/lib/logger/` for new production diagnostics. Do not add production `console.log` or `console.error`.
- Do not modify generated files merely to satisfy a global check. Report unrelated pre-existing failures separately.

---

## Task 1: Extract the structured capability arbitration contract

**Files:**

- Create `src/lib/ai/capability-arbitration.ts`.
- Create `src/lib/ai/capability-arbitration.test.ts`.
- Modify `src/lib/ai/orchestrator.ts` to use the new arbitration module instead of its local prompt-module classifier contract.

- [ ] **Step 1: Add failing contract tests**

Add Vitest coverage for a pure policy function with this public shape:

```ts
export type CapabilityDecision = {
  rag: boolean;
  webSearch: boolean;
  webFetch: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  memoryDelete: boolean;
  routineProposal: boolean;
  userContext: boolean;
  voiceOutput: boolean;
  source: "fallback" | "classifier" | "mixed";
  reasonCodes: string[];
};

export type CapabilityArbitrationInput = {
  userMessage: string;
  isGuest: boolean;
  memoryEnabled: boolean;
  voiceAllowed: boolean;
  responseMode: "text" | "voice";
  explicitWebRule: "required" | "allowed" | "forbidden";
  classifier: Partial<CapabilityDecision> | null;
};

export function normalizeCapabilityDecision(
  input: CapabilityArbitrationInput,
): CapabilityDecision;
```

The red tests must prove that:

- classifier output can select RAG and web together;
- explicit web-forbidden input clears `webSearch` and `webFetch` even when the classifier selects them;
- guests cannot read or mutate memory; a routine proposal remains non-persistent and may stay available under the existing guest entitlement;
- `memoryEnabled: false` clears every memory capability;
- `responseMode: "voice"` records `voiceOutput: true` only when `voiceAllowed` is true;
- an explicit memory-forget intent can enable `memoryDelete`, while an ambiguous classifier-only delete request is cleared;
- a classifier failure can be represented by `null` and produces a conservative fallback without throwing.

Run:

```bash
bunx vitest run src/lib/ai/capability-arbitration.test.ts
```

Expected result before implementation: the new test file fails because the module and contract do not exist.

- [ ] **Step 2: Implement the bounded contract**

Implement the schema/types and `normalizeCapabilityDecision`. Keep the function deterministic and side-effect free. Add explicit reason codes such as `guest_memory_denied`, `web_rule_forbidden`, `memory_disabled`, `delete_requires_explicit_intent`, and `voice_guard_denied` so metrics can retain only safe categories.

Move the existing structured classifier schema and invocation into a small exported function in the new module:

```ts
export async function classifyCapabilities(input: {
  userMessage: string;
  context: string;
  modelId: string;
}): Promise<Partial<CapabilityDecision> | null>;
```

The classifier must use a closed schema, a bounded context length, and the existing model/usage-meter boundary. Treat malformed output, provider errors, and low-confidence/uncertain responses as `null`; do not retry indefinitely. The classifier may propose capabilities but cannot override the normalization rules.

Add a small mode helper:

```ts
export function getCapabilityPlannerMode(): "legacy" | "agentic";
```

It must read `AI_CAPABILITY_PLANNER_MODE` and return `legacy` for missing or invalid values. Do not change the default during this task.

- [ ] **Step 3: Wire the orchestrator to the new contract**

Replace the local prompt-module classifier call in `src/lib/ai/orchestrator.ts` with `classifyCapabilities` and `normalizeCapabilityDecision`. Preserve the existing model fallback and usage accounting. Store only the normalized decision in the per-turn execution context; never pass classifier reasoning to the model or client.

Update the focused orchestrator tests to assert the new classifier boundary and fallback behavior:

```bash
bunx vitest run src/lib/ai/capability-arbitration.test.ts src/lib/ai/orchestrator.test.ts
```

- [ ] **Step 4: Verify and commit**

Run the focused command, `bun run lint`, and `git diff --check`. Commit only the new arbitration module, its tests, and the orchestrator/intent changes with:

```text
feat(ai): add per-turn capability arbitration
```

---

## Task 2: Project arbitration into `TurnPlan` without deterministic capability exclusion

**Files:**

- Modify `src/lib/ai/turn-plan.ts`.
- Modify `src/lib/ai/turn-plan.test.ts`.
- Modify `src/lib/ai/orchestrator.ts` at the `ToolPlan`/`toolPlanFromTurnPlan` boundary.

- [ ] **Step 1: Add failing TurnPlan tests**

Extend the existing tests to cover the agentic planner mode. The tests must assert the complete capability projection, including:

```ts
type TurnPlanCapabilities = {
  webSearch: boolean;
  webFetch: boolean;
  rag: boolean;
  userContext: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  memoryDelete: boolean;
  routineProposal: boolean;
  voiceOutput: boolean;
};
```

Add cases for:

- RAG plus web in the same authenticated turn;
- memory write and overwrite as the same capability, with the tool deciding create versus update by the stable memory key;
- explicit exact deletion enabled only for the requested key;
- routine proposal selected independently of memory and web;
- legacy mode retaining current `!webSearch` RAG behavior and post-generation compatibility;
- guest and compact turns remaining unable to expose persistent memory tools while preserving non-persistent routine-proposal availability;
- `planLegacyTurn` preserving existing voice/web/brief compatibility.

Run:

```bash
bunx vitest run src/lib/ai/turn-plan.test.ts
```

Expected result before implementation: the new assertions fail because the current plan omits the new fields and excludes RAG whenever web is active.

- [ ] **Step 2: Extend the plan types and projection**

Add the new fields to `TurnPlan`, `TurnPlanClassifierDecision`, and the internal `ToolPlan` mapping. Use one `memoryWrite` flag for create and overwrite; do not introduce separate user-facing toggles. Preserve `profileWrite`, `preferenceWrite`, and `notesWrite` as existing deterministic sub-capabilities when their existing explicit intents are present.

In agentic mode:

- take web/RAG/memory/routine booleans from the normalized capability decision;
- allow `rag` and `webSearch` to remain true together;
- allow `webFetch` only when `webSearch` is also true or a valid fetched result is already available;
- derive `voiceOutput` from the already-authorized response mode and voice guard result;
- prevent compact/benchmark/paired paths from exposing persistent write/delete tools.

In legacy mode, preserve the current deterministic plan exactly, including the web-versus-RAG exclusion and legacy memory extractor path.

- [ ] **Step 3: Verify projection consumers**

Update all `toolPlanFromTurnPlan` and `selectToolPlan` call sites so the same immutable plan is used for tool construction, max-step calculation, telemetry, and persistence. Add a regression assertion that a single turn cannot silently recompute a different capability plan between planning and execution.

Run:

```bash
bunx vitest run src/lib/ai/turn-plan.test.ts src/lib/ai/orchestrator.test.ts
```

- [ ] **Step 4: Verify and commit**

Run the focused tests and `git diff --check`, then commit:

```text
refactor(ai): project capability decisions into turn plans
```

---

## Task 3: Expose bounded RAG and composable tool inventory

**Files:**

- Create `src/lib/ai/tools/rag.ts`.
- Create `src/lib/ai/tools/rag.test.ts`.
- Modify `src/lib/ai/orchestrator.ts`.
- Modify `src/lib/ai/rag.ts` only for the shared result type or bounded query helper required by the new tool.
- Modify `src/lib/ai/orchestrator.test.ts`.

- [ ] **Step 1: Add the failing RAG tool tests**

Define the tool boundary:

```ts
export type RagToolResult = {
  success: boolean;
  chunkCount: number;
  context: string;
};

export function createRagTools(options?: {
  maxQueryCharacters?: number;
}): {
  searchRag: Tool;
};
```

Test that:

- `searchRag` calls the existing `getRagContext` boundary once with a bounded query;
- empty/oversized input is rejected without an embedding call;
- no-result output is `{ success: true, chunkCount: 0, context: "" }`;
- provider/database errors return a safe failure result and log through the existing logger boundary;
- the tool result contains context and chunk count but no embedding vector, database row, document ID, or raw diagnostic payload.

Run:

```bash
bunx vitest run src/lib/ai/tools/rag.test.ts
```

Expected result before implementation: the new tests fail because `searchRag` does not exist.

- [ ] **Step 2: Add RAG to the agentic tool inventory**

Expose `searchRag` from `createToolsWithContext` only when the immutable agentic plan has `rag: true`. Keep the existing TinyFish tools independently gated by `webSearch` and `webFetch`. Do not make either tool expose the other capability implicitly.

Replace the agentic path’s direct web prefetch with native tool selection. Keep `prefetchDirectWebSearch` only for `legacy` mode and update tests to prove that agentic mode does not perform a hidden web request before `streamText`.

- [ ] **Step 3: Remove forced ordering while retaining hard limits**

Update `createToolLoopPrepareStep` and `getMaxToolSteps` so the model can select RAG, web search, web fetch, memory, and routine proposal in a composable sequence. Retain deterministic limits:

- at most one RAG search per turn;
- at most one routine proposal per turn;
- web fetch only after a web result exposes a valid candidate URL;
- the existing global tool-step ceiling and plan/quota checks;
- no persistent tool in guest, benchmark, comparison, or disabled-memory paths.

The prepare step must not force `proposeRoutine` or any other tool. The model prompt may describe available tools, while the server enforces inventory and limits.

- [ ] **Step 4: Verify and commit**

Run:

```bash
bunx vitest run src/lib/ai/tools/rag.test.ts src/lib/ai/orchestrator.test.ts src/lib/ai/rag.test.ts
git diff --check
```

Commit:

```text
feat(ai): make rag and web tools composable
```

---

## Task 4: Add guarded autonomous memory writes, overwrites, deletion, and sensitive approval

**Files:**

- Modify `prisma/schema.prisma`.
- Create `prisma/migrations/20260809120000_add_memory_approvals/migration.sql`.
- Create `src/lib/ai/memory-approval.ts`.
- Create `src/lib/ai/memory-approval.test.ts`.
- Modify `src/lib/ai/tools/memory.ts`.
- Modify `src/lib/ai/tools/memory.test.ts`.
- Modify `src/lib/channel-flow/types.ts`.
- Modify `src/lib/channel-flow/run.ts` where inbound context becomes `StreamChatOptions`.
- Modify `src/lib/ai/memory-extractor.ts` and its tests.
- Modify `src/lib/channel-flow/persistence.ts` and its tests.

- [ ] **Step 1: Add failing database/service tests**

Add the following exact Prisma relations and model. `MemoryApproval` is linked to the triggering inbound message because the assistant response that asks for confirmation is still streaming when the tool executes; the approval lookup then verifies that the confirmation is the immediate next user turn.

```prisma
enum MemoryApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

model MemoryApproval {
  id                 String               @id @default(cuid())
  userId             String
  user               User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceInboundMessageId String
  sourceInboundMessage Message            @relation("MemoryApprovalSource", fields: [sourceInboundMessageId], references: [id], onDelete: Cascade)
  key                String
  value              Json
  category           String
  confidence         Float
  status             MemoryApprovalStatus @default(PENDING)
  createdAt          DateTime             @default(now())
  expiresAt          DateTime
  resolvedAt         DateTime?
  @@index([userId, status, createdAt])
  @@index([sourceInboundMessageId])
}
```

Add `memoryApprovals MemoryApproval[]` to `User` and `memoryApprovals MemoryApproval[] @relation("MemoryApprovalSource")` to `Message`. Generate the SQL migration from the validated schema rather than hand-editing a different schema contract.

Add tests around these exact functions:

```ts
export type PendingMemoryApproval = {
  id: string;
  userId: string;
  sourceInboundMessageId: string;
  key: string;
  value: unknown;
  category: string;
  confidence: number;
  expiresAt: Date;
};

export async function createMemoryApproval(input: {
  userId: string;
  sourceInboundMessageId: string;
  key: string;
  value: unknown;
  category: string;
  confidence: number;
}): Promise<PendingMemoryApproval>;

export async function getImmediatelyAttributableApproval(input: {
  userId: string;
  conversationId: string;
  currentUserMessageId: string;
}): Promise<PendingMemoryApproval | null>;

export async function resolveMemoryApproval(input: {
  userId: string;
  approvalId: string;
  decision: "approve" | "reject";
  currentUserMessageId: string;
}): Promise<{ status: "approved" | "rejected" | "stale"; memoryId?: string }>;
```

The red tests must prove that:

- approval rows are user-scoped and expire;
- only the immediately attributable pending approval can be resolved;
- approval from another user, an unrelated subsequent turn, an expired row, or a repeated resolution cannot write a memory;
- approval writes exactly one stable key and marks the approval resolved atomically;
- rejection marks the approval rejected without creating or changing a memory.

Run:

```bash
bunx vitest run src/lib/ai/memory-approval.test.ts
```

Expected result before implementation: the new service and model tests fail because the model/service do not exist.

- [ ] **Step 2: Implement memory tool semantics**

Extend `createMemoryTools` with these bounded tools:

```ts
saveMemory({
  key,
  value,
  category,
  confidence,
  sensitivity,
}): Promise<{
  status: "saved" | "approval_required" | "rejected";
  memoryId?: string;
  approvalId?: string;
}>;

requestMemoryApproval({
  key,
  value,
  category,
  confidence,
}): Promise<{ status: "approval_required"; approvalId: string }>;

resolveMemoryApproval({
  approvalId,
  decision,
}): Promise<{ status: "approved" | "rejected" | "stale"; memoryId?: string }>;
```

Implement these rules server-side:

- `saveMemory` uses the existing `[userId, key]` uniqueness contract, so create and overwrite/update are one capability. Return whether it created or updated only as a safe status, not the stored value.
- A normal explicit or inferred fact may save silently when its category is low-risk and confidence passes the existing threshold.
- Health, diagnosis, trauma, intimate, and other high-impact categories never save directly from an inferred fact. They create one `MemoryApproval` tied to the triggering inbound message and the assistant response generated for that turn.
- Explicit user-supplied sensitive facts may use the same approval path when the model cannot establish that the user intended persistence.
- `deleteMemory` accepts one exact stable key, requires `memoryDelete` from an explicit forget intent, and returns only `deleted`, `not_found`, or `ambiguous`. It must never accept a wildcard, category-wide request, or model-generated broad target.
- All memory tools remain user-scoped and use atomic update/delete behavior. Invalidate the existing prompt cache after every actual write, overwrite, approval, or deletion.

Update tool descriptions and tests so the model is told that side effects are silent, ordinary facts may be inferred conservatively, sensitive inferences require a natural confirmation, and a generic unrelated “yes” does not approve a pending fact.

- [ ] **Step 3: Pass approval context through the channel flow**

Add the pending approval context to the authenticated inbound AI options in `src/lib/channel-flow/run.ts`. Load it before planning the current turn and expose `resolveMemoryApproval` only when the current user message is the immediate attributable follow-up to the `sourceInboundMessageId`. Do not use a client-provided approval payload as authority.

Ensure web, Telegram, and WhatsApp share the same server-side approval service and user/conversation scoping. A channel adapter may change presentation, but not approval rules.

- [ ] **Step 4: Separate agentic memory tools from the legacy extractor**

In `AI_CAPABILITY_PLANNER_MODE=agentic`, disable the post-generation `extractAndSaveMemories` scheduling for the turn and let the model’s `saveMemory`/approval tools be the only memory write path. In `legacy`, preserve the current extractor behavior and explicit-only extraction instruction.

Add regression tests proving that an agentic turn with no memory tool call creates no memory, a low-risk save overwrites the stable key correctly, a sensitive inference creates only a pending approval, explicit “dimentica questa cosa” deletes only the matched memory, and an ambiguous deletion does nothing.

Run:

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/ai/memory-approval.test.ts src/lib/ai/tools/memory.test.ts src/lib/ai/memory-extractor.test.ts src/lib/channel-flow/persistence.test.ts
```

- [ ] **Step 5: Verify and commit**

After the focused tests pass, inspect the migration SQL, run `git diff --check`, and commit:

```text
feat(memory): add guarded autonomous memory operations
```

Do not apply the migration to production or a shared database in this task. Apply it only through the repository’s verified development/integration path in Task 8.

---

## Task 5: Let the model choose routine proposals and preserve voice guardrails

**Files:**

- Modify `src/lib/ai/orchestrator.ts`.
- Modify `src/lib/ai/tools/routine-proposal.ts` to state the agentic selection and proposal-only semantics.
- Modify `src/lib/ai/orchestrator.test.ts`.
- Modify the existing voice decision/preflight tests only when adding capability metadata assertions.

- [ ] **Step 1: Add failing orchestration tests**

Add tests proving that in agentic mode:

- the routine tool is present only when `routineProposal` is selected;
- the tool is never forced by `prepareStep` and is called at most once;
- a routine proposal never creates or mutates `Routine`/`RoutineAttempt`;
- a user can request a routine and the model can still select RAG or web in the same turn;
- the existing voice decision remains false when the user’s voice preference is disabled, the plan is ineligible, capacity is unavailable, quota is exhausted, cadence blocks automatic delivery, or the input explicitly requires text.

Run:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/voice/decision.test.ts src/lib/voice/preflight.test.ts
```

Expected result before implementation: tests fail because the current routine path is regex-forced and the new plan field is not yet used for inventory.

- [ ] **Step 2: Update routine policy and tool-loop behavior**

Change the agentic prompt policy from “explicit routine intent must call the tool” to “the model may call the proposal tool when it judges a concrete, useful routine would help; call it at most once; never save it.” Keep the existing routine proposal schema and persistence extraction.

Make `shouldEnableRoutineProposal` return the normalized plan capability in agentic mode and retain its current deterministic behavior in legacy mode. Remove the agentic `prepareStep` forced call while retaining the step ceiling.

- [ ] **Step 3: Record voice as a capability outcome**

Use the existing `responseMode` from `chat-route-handler.ts` and voice decision metadata to set `voiceOutput` in the immutable capability decision. Do not move voice delivery into a model tool and do not add an “always voice” setting. Add tests for automatic voice selection and explicit text veto.

- [ ] **Step 4: Verify and commit**

Run the focused tests and `git diff --check`, then commit:

```text
refactor(ai): delegate routine choice to capability planner
```

---

## Task 6: Persist safe capability usage and render discreet indicators

**Files:**

- Modify `src/lib/ai/cost-calculator.ts`.
- Modify `src/lib/ai/telemetry.ts`.
- Modify `src/lib/channel-flow/persistence.ts`.
- Modify `src/lib/channel-flow/persistence.test.ts`.
- Modify `src/lib/chat-client.ts` or the existing UI message type definition where `data-aiCapabilities` must be typed.
- Modify `src/app/(chat)/chat/chat-reactivity-ui.ts`.
- Modify `src/app/(chat)/chat/chat-reactivity-ui.test.ts`.
- Modify `src/app/(chat)/components/MessageList.tsx`.
- Modify `src/app/(chat)/components/MessageList.behavior.test.tsx`.

- [ ] **Step 1: Add failing metric and persistence tests**

Define a safe aggregate type:

```ts
export type CapabilityUsage =
  | "rag"
  | "web"
  | "memory"
  | "routine"
  | "voice";
```

Extend `AIMetrics` and finish metadata with `ragAttempted`, `ragChunksCount`, and `capabilitiesUsed: CapabilityUsage[]`. Add tests proving:

- `ragAttempted` is true when `searchRag` is called even with zero chunks;
- `ragUsed` is true only when at least one chunk is injected/returned as context;
- tool arguments and results are not included in persisted capability metadata;
- memory reads/writes/deletes collapse to the single safe `memory` indicator;
- a routine proposal records only `routine`;
- voice output records only `voice` and does not expose provider details.

Run:

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts src/lib/ai/orchestrator.test.ts
```

Expected result before implementation: the new fields and data part are absent.

- [ ] **Step 2: Implement safe aggregation and telemetry allowlisting**

Aggregate capability usage from the normalized plan plus completed tool calls, using completed calls/results for actual-use indicators. Keep selection and actual use separate in metrics so an unused available tool is not reported as used. Add only scalar/closed-list properties to the existing PostHog allowlist. Never pass `reason`, query, key, category, value, URL, host, document ID, or raw tool payload.

Persist a typed `data-aiCapabilities` message part containing only:

```ts
{
  capabilities: CapabilityUsage[];
}
```

Keep routine proposal data in its existing dedicated part. Do not emit a capability part for an empty list.

- [ ] **Step 3: Replace verbose tool narration with non-interactive indicators**

Change `getAssistantToolFeedback`/the related UI helper so active and completed tools map to generic labels and icons, never interpolating query, category, key, URL, host, or memory content. Use the existing visual system and a non-clickable, informational presentation with accessible text such as “Ricerca”, “Contesto”, “Memoria”, or “Routine”. Do not show tool names, internal status codes, or model reasoning in assistant prose.

Render persisted `data-aiCapabilities` in `MessageList.tsx` as discreet indicators. Ensure indicators are not buttons, links, menus, or drilldowns. Preserve the existing text/voice message rendering and routine proposal interaction.

- [ ] **Step 4: Verify and commit**

Run:

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts src/lib/ai/orchestrator.test.ts src/app/'(chat)'/chat/chat-reactivity-ui.test.ts src/app/'(chat)'/components/MessageList.behavior.test.tsx
git diff --check
```

Commit:

```text
feat(chat): show discreet capability indicators
```

---

## Task 7: Apply one immutable decision to prepared turns and every channel

**Files:**

- Modify `src/lib/ai/orchestrator.ts` in `prepareChatTurn`, `executePreparedChatTurn`, and the normal stream path.
- Modify `src/lib/channel-flow/run.ts` where `StreamChatOptions` is assembled and where the normalized decision is threaded through the shared flow.
- Modify `src/app/api/chat/route.test.ts` for the authenticated/guest web boundary.
- Modify `src/app/api/webhooks/telegram/route.test.ts` and `src/app/api/webhooks/whatsapp/route.test.ts` for external-channel reuse of the shared policy.
- Modify `src/lib/model-experiments/runtime.ts` to pass the immutable prepared-turn decision without enabling executable tools.

- [ ] **Step 1: Add failing immutability and channel tests**

Add tests in `src/lib/ai/orchestrator.test.ts`, `src/lib/channel-flow/run.test.ts`, `src/app/api/chat/route.test.ts`, `src/app/api/webhooks/telegram/route.test.ts`, and `src/app/api/webhooks/whatsapp/route.test.ts` proving that:

- planning happens once per inbound message;
- the same `CapabilityDecision` is used for tool inventory, metrics, persistence, and the response mode;
- a prepared/paired comparison turn cannot expose `saveMemory`, `deleteMemory`, `requestMemoryApproval`, `resolveMemoryApproval`, or `proposeRoutine` as executable tools;
- a guest turn can use permitted web tools but cannot read/write/delete memory;
- web, Telegram, and WhatsApp use the shared memory approval and capability policy rather than channel-specific deletion or write rules;
- agentic mode does not run legacy direct web prefetch or post-generation memory extraction for the same turn.

Run:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/channel-flow/run.test.ts src/app/api/chat/route.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts
```

Expected result before implementation: at least the new immutable-decision and agentic channel assertions fail.

- [ ] **Step 2: Thread the decision through execution**

Add the normalized decision to the prepared-turn/stream context as an immutable value. Do not recompute it inside `createToolsWithContext`, `prepareStep`, persistence, or metrics. Use the same decision for all channel adapters; only the voice preflight and channel delivery wrapper may add channel-specific output metadata.

Ensure the legacy mode branch remains byte-compatible at the behavior level: current web prefetch, current post-generation extractor, current routine intent gate, and current tool inventory remain active when the flag is `legacy`.

- [ ] **Step 3: Verify and commit**

Run the focused tests, then the complete AI/channel unit set:

```bash
bunx vitest run src/lib/ai src/lib/channel-flow src/lib/channels/web src/lib/channels/telegram src/lib/channels/whatsapp
git diff --check
```

Commit:

```text
refactor(channels): share immutable capability decisions
```

---

## Task 8: Update subsystem documentation and complete verification

**Files:**

- Modify `docs/ai-system.md`.
- Do not edit user-owned planning documents listed under Global Constraints.

- [ ] **Step 1: Add documentation regression checks**

Before editing, search the docs for the current claims that RAG is disabled on web turns, memory writes are extractor-only, routine proposals are deterministic, and tool activity is narrated in prose. Replace those claims in `docs/ai-system.md` with the verified agentic/legacy distinction.

- [ ] **Step 2: Document the shipped contract**

Update `docs/ai-system.md` with:

- the per-message capability decision flow;
- the distinction between model selection and deterministic guardrails;
- composable RAG and web behavior;
- memory create/update/overwrite, exact deletion, silent ordinary writes, and sensitive approval;
- routine proposal-only semantics;
- existing voice guardrails;
- `AI_CAPABILITY_PLANNER_MODE` rollout behavior;
- safe capability indicators and excluded payloads;
- legacy compatibility and migration expectations.

Use Italian product terms where the document already does so, and keep examples free of real user data.

- [ ] **Step 3: Run repository verification**

Run the relevant gates in this order:

```bash
bunx prisma validate
bunx prisma generate
bun run lint
bun run test
git diff --check
```

For the development/integration database path, apply the migration only to the configured development target and run the focused integration suites if `NEON_API_KEY`, `NEON_PROJECT_ID`, and the repository’s test database prerequisites are available:

```bash
bun run test:integration
```

Record any unavailable external credential, migration target, or unrelated pre-existing failure without weakening the implementation.

- [ ] **Step 4: Verify the user-visible path**

Start the development server with the repository’s normal command, use the T3 preview browser when attached, and verify an authenticated chat route at a real local chat ID. Exercise these scenarios with non-sensitive fixture text:

1. A message that selects both RAG and web shows only discreet generic indicators.
2. A low-risk inferred preference can be silently written and then read on a subsequent turn.
3. “Dimentica questa cosa” deletes only the exact matched fact; an ambiguous request does not delete.
4. A sensitive inferred fact asks for natural approval and remains absent from `Memory` until a direct “sì, ricordalo”.
5. A routine suggestion produces a proposal only and does not save a routine.
6. Voice remains governed by the existing user preference, plan, quota, provider, and cadence guards.

Do not claim production, real-account, Telegram, WhatsApp, or physical-device verification unless those environments are actually exercised.

- [ ] **Step 5: Final review and commit**

Inspect `git status --short`, verify that only authorized files are staged, confirm the user-owned dirty files remain untouched, and run `git diff --cached --check`. Commit the documentation and any final test-only changes with:

```text
docs(ai): document autonomous capability policy
```

At handoff, report separately whether changes are committed, pushed, deployed, database-migrated, and browser-verified.

---

## Execution Handoff

The plan is complete and self-contained. Execute it in a fresh context using one of these paths:

1. **Subagent-driven development (recommended):** use `superpowers:subagent-driven-development`, assigning each independent task to a fresh subagent and running the listed verification after every task.
2. **Inline execution:** use `superpowers:executing-plans`, working through the checklist sequentially in this context.

The implementation has not started yet; this plan deliberately separates the approved design from code changes and keeps the default rollout in legacy mode until verification is complete.
