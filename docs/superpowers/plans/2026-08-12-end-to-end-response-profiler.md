# End-to-End Response Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and present a privacy-safe, per-response profiler that separates backend execution from browser-perceived latency for authenticated private Web chat in every environment.

**Architecture:** Add strict versioned trace contracts shared by server and client, a request-scoped monotonic server collector passed through the Web route, channel flow, and orchestrator, and a browser collector keyed by the existing `clientMessageId`. Persist an initial server snapshot atomically with the assistant message, finalize it best effort, ingest the immutable client trace through an owner-correlated PUT endpoint, then expose both traces only through the existing technical-metrics authorization boundary and render them as separate server and browser timelines.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, AI SDK 7, `@ai-sdk/react` 4, Zod 4, Prisma/PostgreSQL/Neon, Vitest, Testing Library, Biome, PostHog.

## Global Constraints

- Implement the approved contract in `docs/superpowers/specs/2026-08-12-end-to-end-response-profiler-design.md`; do not merge the server and browser clocks or rename their residual as network latency.
- Collect and persist traces in development, preview, and production. Visibility remains governed by `resolveTechnicalMetricsVisibility`; guests, non-owners, and public/shared viewers must not receive detailed traces.
- Never persist prompts, user or assistant text, reasoning, memory facts, RAG queries or chunks, tool arguments or results, URLs, IP addresses, user-agent strings, wall-clock timestamps, raw provider metadata, errors, or arbitrary keys in either trace.
- Use only server-controlled, length-bounded model, provider, and tool labels. Trace schemas are strict allowlists and are parsed again before API exposure.
- Cap each trace at 32 KiB, server traces at 96 spans, labels at 128 characters, and all offsets/durations at 900,000 ms. A collector limit produces a valid `partial` trace; an oversized client request is rejected.
- Profiling is best effort. Collector, finalization, telemetry, and client-ingestion failures must not fail or delay a valid chat response.
- Keep `generationTimeMs`, `toolTiming`, memory metadata, and `executionRoute` unchanged for compatibility. Do not add scalar database summary columns and do not backfill historical rows.
- Scope the first release to authenticated private Web chat. Shared channel types may carry the collector, but guest Web, Telegram, and WhatsApp do not gain a browser profiler. Voice-first responses still persist a server trace through their canonical assistant row; model-comparison streams remain outside per-message persistence because they do not create one canonical assistant `MessageMetrics` row, and this work must not synthesize one.
- `src/lib/ai/orchestrator.test.ts` contains unrelated user-owned edits. Do not modify or stage it; add focused tests in new files and use existing clean channel/persistence tests for integration coverage.
- Also preserve unrelated edits in `src/lib/ai/communication-style.ts`, `src/lib/ai/light-prompt.ts`, and `src/lib/plans/catalog.ts`. Stage only the files named by each task.
- Before changing route handlers or streaming behavior, read the local Next.js 16 route-handler and streaming documentation completely.
- Use `bun run` and `bunx`. When `prisma/schema.prisma` changes, validate it and run `bunx prisma generate` before typechecking or tests that import the generated client.
- Apply the migration only to the explicitly intended development database during execution. This plan does not authorize a production migration, production deployment, push, or PR.
- For the frontend task, use `impeccable` for the detailed panel and `vercel:react-best-practices` after TSX edits. For runtime verification, use `next-dev-loop` and the attached T3 preview first.

## File Structure Map

### New files

- `src/lib/response-profiler/contracts.ts` — strict Zod contracts, inferred trace types, byte-size checks, and deterministic equality.
- `src/lib/response-profiler/contracts.test.ts` — version, bounds, ordering, privacy, strictness, and size tests.
- `src/lib/response-profiler/server-trace.ts` — request-scoped monotonic collector and idempotent span handles.
- `src/lib/response-profiler/server-trace.test.ts` — sequential, overlapping, failed, cancelled, TTFT, and cap behavior.
- `src/lib/response-profiler/client-trace.ts` — browser milestone collector, completion derivation, keepalive submission, and bounded retry.
- `src/lib/response-profiler/client-trace.test.ts` — record-once, hidden document, retry, abandonment, and serialization tests.
- `src/lib/response-profiler/profiling-chat-transport.ts` — AI SDK transport subclass that instruments parsed stream chunks without reparsing SSE.
- `src/lib/response-profiler/profiling-chat-transport.test.ts` — stream-open, first-chunk, first-text-delta, completion, cancellation, and pass-through tests.
- `src/lib/response-profiler/client-trace-persistence.ts` — owner correlation and immutable client-trace persistence service.
- `src/lib/response-profiler/client-trace-persistence.test.ts` — private-owner, pending, identical retry, conflict, and cross-user tests.
- `src/lib/response-profiler/summary.ts` — pure summary/throughput/timeline derivation for the UI.
- `src/lib/response-profiler/summary.test.ts` — complete, partial, legacy, parallel, and residual calculations.
- `src/app/api/chat/messages/client-trace/route.ts` — authenticated PUT endpoint.
- `src/app/api/chat/messages/client-trace/route.test.ts` — HTTP validation, auth, response-code, and telemetry tests.
- `src/app/(chat)/components/technical-metrics/ProfilerSummary.tsx` — compact actual-execution and perceived-latency summary.
- `src/app/(chat)/components/technical-metrics/ServerTimeline.tsx` — backend waterfall with overlapping spans.
- `src/app/(chat)/components/technical-metrics/BrowserTimeline.tsx` — separate network/render/persistence lanes.
- `prisma/migrations/20260812150000_add_response_profiler_traces/migration.sql` — additive nullable JSONB columns.

### Existing files to modify

- `prisma/schema.prisma` — add nullable `serverTrace` and `clientTrace` to `MessageMetrics`.
- `src/lib/channel-flow/types.ts` — pass the collector through execution and assistant persistence.
- `src/lib/channel-flow/persistence.ts` — atomically store a partial server trace and finalize it best effort.
- `src/lib/channel-flow/persistence.test.ts` — verify partial/final persistence and failure isolation.
- `src/lib/channel-flow/run.ts` — forward the request-scoped collector to orchestration and persistence.
- `src/lib/channel-flow/run.test.ts` — verify propagation and cancellation status without content capture.
- `src/lib/channels/web/chat-route-handler.ts` — create the collector and instrument authenticated Web setup.
- `src/app/api/chat/route.test.ts` — assert request-scoped collection and protected behavior.
- `src/lib/ai/orchestrator.ts` — instrument planning, context, provider attempts, first generated text, model streaming, and tools.
- `src/lib/ai/rag.ts` and `src/lib/ai/rag.test.ts` — split query embedding from vector-search spans without exposing query or result content.
- `src/lib/ai/recall-context.ts` and `src/lib/ai/recall-context.test.ts` — retain parallel durable-fact and conversation-recall spans.
- `src/lib/ai/telemetry.ts` and `src/lib/ai/telemetry.test.ts` — emit the approved client summary event while continuing to exclude complete trace JSON from analytics.
- `src/lib/chat.ts`, `src/app/api/chats/[id]/route.ts`, and `src/app/api/chat/messages/route.ts` — select and expose validated traces at the existing authorization boundary.
- Corresponding tests: `src/lib/chat.test.ts`, `src/app/api/chats/[id]/route.test.ts`, and `src/app/api/chat/messages/route.test.ts`.
- `src/lib/technical-metrics.ts` and `src/lib/technical-metrics.test.ts` — parse traces and omit malformed or unauthorized diagnostics.
- `src/types/chat.ts` — add trace types to `Usage`.
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx` — start one collector per user turn, wire transport/state/DOM milestones, reconcile by source client id, and submit asynchronously.
- `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx` — cover normal submit, edit, regenerate, initial message, rendering, and non-blocking submission.
- `src/app/(chat)/components/TechnicalMetricsDetails.tsx` and `.test.tsx` — compose summary plus separate responsive timelines while retaining legacy behavior.

---

### Task 1: Define strict trace contracts

**Files:**

- Create: `src/lib/response-profiler/contracts.ts`
- Create: `src/lib/response-profiler/contracts.test.ts`

**Interfaces:**

- Produces `ServerTraceV1`, `ClientTraceV1`, `ServerTraceSpanV1`, `ServerSpanName`, `ServerSpanAttributes`, `parseServerTrace`, `parseClientTrace`, and `clientTracesEqual` for every later task.
- Contains no Node-only or browser-only imports so the same validation runs at collection, ingestion, API projection, and UI boundaries.

- [ ] **Step 1: Write failing contract tests**

Cover these exact cases in `contracts.test.ts`:

```ts
expect(parseServerTrace(validServerTrace)).toEqual(validServerTrace);
expect(parseClientTrace(validClientTrace)).toEqual(validClientTrace);
expect(parseServerTrace({ ...validServerTrace, version: 2 })).toBeNull();
expect(parseClientTrace({ ...validClientTrace, prompt: "SECRET" })).toBeNull();
expect(parseServerTrace({
  ...validServerTrace,
  spans: [{ ...validServerTrace.spans[0], toolArguments: "SECRET" }],
})).toBeNull();
expect(parseServerTrace({ ...validServerTrace, spans: Array(97).fill(span) }))
  .toBeNull();
expect(parseClientTrace(outOfOrderClientTrace)).toBeNull();
expect(parseClientTrace(completedTraceWithMissingMilestone)).toBeNull();
expect(parseClientTrace(oversizedClientTrace)).toBeNull();
```

Also assert acceptance of these two valid edge cases:

- `firstVisibleFrameMs` after `streamCompletedMs`;
- a `partial` trace with only `requestStartedMs`, `streamOpenedMs`, and `firstChunkReceivedMs`.

Reject duplicate span ids, missing/forward parent ids, spans ending after `totalMs`, TTFT after `totalMs`, and partial client traces that contain a downstream milestone without its causal predecessor. In particular, first delta requires first chunk and stream open; DOM requires first delta; visible frame requires DOM; persisted resolution requires stream completion.

- [ ] **Step 2: Run the focused tests and verify the module is missing**

```bash
bunx vitest run src/lib/response-profiler/contracts.test.ts
```

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement the closed contracts**

Use these exported constants and exact top-level shapes:

```ts
export const TRACE_VERSION = 1 as const;
export const MAX_TRACE_MS = 900_000;
export const MAX_SERVER_SPANS = 96;
export const MAX_TRACE_BYTES = 32 * 1024;
export const MAX_TRACE_LABEL_LENGTH = 128;

export const SERVER_SPAN_NAMES = [
  "auth",
  "user_lookup",
  "chat_lookup",
  "billing_sync",
  "rate_limit",
  "inbound_claim",
  "attachment_resolution",
  "transcription",
  "classification",
  "routing",
  "history",
  "user_context",
  "memory_facts",
  "conversation_recall",
  "rag_decision",
  "rag_embedding",
  "rag_search",
  "prompt_build",
  "provider_wait",
  "model_stream",
  "tool",
  "assistant_persistence",
] as const;

export type ServerTraceV1 = {
  version: 1;
  status: "completed" | "partial" | "cancelled";
  totalMs: number;
  timeToFirstTokenMs?: number;
  spans: ServerTraceSpanV1[];
};

export type ClientTraceV1 = {
  version: 1;
  status: "completed" | "partial" | "abandoned";
  milestones: {
    requestStartedMs: 0;
    streamOpenedMs?: number;
    firstChunkReceivedMs?: number;
    firstTextDeltaReceivedMs?: number;
    firstDomTextMs?: number;
    firstVisibleFrameMs?: number;
    streamCompletedMs?: number;
    persistedMessageResolvedMs?: number;
  };
};
```

Build both schemas with `.strict()` at every object level. Use integer, finite, non-negative, capped millisecond schemas. Add `superRefine` checks for unique ordered span ids, valid earlier parents, span/TTFT bounds within `totalMs`, causal milestone presence, partial ordering, and the completed-milestone requirement. The server span attribute schema may contain only `attemptSequence`, `profile`, `model`, `provider`, `toolName`, `ragChunkCount`, and `outcome`.

After Zod validation, reject any serialized trace whose `TextEncoder().encode(JSON.stringify(trace)).byteLength` exceeds `MAX_TRACE_BYTES`. Implement `parseServerTrace` and `parseClientTrace` as non-throwing `unknown -> typed value | null` boundaries. Implement `clientTracesEqual` by comparing the normalized parsed objects, not the untrusted input.

- [ ] **Step 4: Run contract, Biome, and diff checks**

```bash
bunx vitest run src/lib/response-profiler/contracts.test.ts
bunx biome check src/lib/response-profiler/contracts.ts src/lib/response-profiler/contracts.test.ts
git diff --check -- src/lib/response-profiler/contracts.ts src/lib/response-profiler/contracts.test.ts
```

Expected: all pass; the tests prove unknown content-like fields and invalid ordering fail closed.

- [ ] **Step 5: Commit the contracts**

```bash
git add -- src/lib/response-profiler/contracts.ts src/lib/response-profiler/contracts.test.ts
git commit -m "feat(profiler): define trace contracts"
```

### Task 2: Build the request-scoped server collector

**Files:**

- Create: `src/lib/response-profiler/server-trace.ts`
- Create: `src/lib/response-profiler/server-trace.test.ts`

**Interfaces:**

- Consumes the types and caps from Task 1.
- Produces a collector with `startSpan`, `measure`, `markFirstToken`, `markPartial`, and `snapshot`; collector methods never throw into product execution.

- [ ] **Step 1: Write failing collector tests with a fake monotonic clock**

Use an injected `now: () => number` and verify:

```ts
const collector = createServerTraceCollector({ now: () => clock });
const parent = collector.startSpan("history");
clock = 10;
const left = collector.startSpan("memory_facts", undefined, parent.id);
const right = collector.startSpan("conversation_recall", undefined, parent.id);
clock = 30;
left.end("completed");
clock = 40;
right.end("completed");
parent.end("completed");

expect(collector.snapshot("completed").spans).toEqual([
  expect.objectContaining({ name: "history", startOffsetMs: 0, durationMs: 40 }),
  expect.objectContaining({ name: "memory_facts", startOffsetMs: 10, durationMs: 20 }),
  expect.objectContaining({ name: "conversation_recall", startOffsetMs: 10, durationMs: 30 }),
]);
```

Add tests for idempotent `end`, `measure` success/failure, cancellation, first non-empty generated token recorded once, 96-span cap, duration cap, label truncation, invalid attribute omission, and a snapshot with an open span becoming `partial` without mutating the open handle.

- [ ] **Step 2: Run the test and verify the collector is missing**

```bash
bunx vitest run src/lib/response-profiler/server-trace.test.ts
```

Expected: FAIL because the collector module does not exist.

- [ ] **Step 3: Implement the collector API**

Use this public surface:

```ts
export interface ServerSpanHandle {
  readonly id: number;
  end(
    status?: "completed" | "failed" | "cancelled",
    finalAttributes?: ServerSpanAttributes,
  ): void;
}

export interface ServerTraceCollector {
  startSpan(
    name: ServerSpanName,
    attributes?: ServerSpanAttributes,
    parentId?: number,
  ): ServerSpanHandle;
  measure<T>(
    name: ServerSpanName,
    operation: () => Promise<T>,
    attributes?: ServerSpanAttributes,
    parentId?: number,
  ): Promise<T>;
  markFirstToken(): void;
  markPartial(): void;
  markCancelled(): void;
  snapshot(status: "completed" | "partial" | "cancelled"): ServerTraceV1;
}
```

Default `now` to `performance.now()`. Store only the collector start value and relative offsets. Merge only allowlisted, bounded final attributes on the first `end` call so the actual provider and terminal outcome can be recorded when they become known; later `end` calls are no-ops. A snapshot excludes still-open spans and downgrades its status to `partial` without closing or mutating their handles; cancellation paths explicitly close active handles as cancelled and call `markCancelled`. Internal cancellation takes precedence over a later requested `completed` status, while any collection cap takes precedence by producing `partial` unless the request was cancelled. Return a no-op handle after the span cap. Catch validation/snapshot faults internally, mark the collector partial, and return the last valid bounded snapshot. Do not add a singleton or module-global active collector.

- [ ] **Step 4: Run focused checks**

```bash
bunx vitest run src/lib/response-profiler/server-trace.test.ts src/lib/response-profiler/contracts.test.ts
bunx biome check src/lib/response-profiler/server-trace.ts src/lib/response-profiler/server-trace.test.ts
git diff --check -- src/lib/response-profiler
```

Expected: all pass.

- [ ] **Step 5: Commit the collector**

```bash
git add -- src/lib/response-profiler/server-trace.ts src/lib/response-profiler/server-trace.test.ts
git commit -m "feat(profiler): add server trace collector"
```

### Task 3: Add trace storage and failure-isolated server finalization

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812150000_add_response_profiler_traces/migration.sql`
- Modify: `src/lib/channel-flow/types.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`

**Interfaces:**

- Adds nullable JSON columns without a backfill.
- `PersistAssistantOutputInput.traceCollector?: ServerTraceCollector` lets persistence own the `assistant_persistence` span and final snapshot.

- [ ] **Step 1: Extend persistence tests first**

Add mocks for `messageMetrics.update` and a fake collector. Assert the primary transaction receives a partial snapshot:

```ts
expect(mocks.messageMetricsCreate).toHaveBeenCalledWith({
  data: expect.objectContaining({
    serverTrace: expect.objectContaining({ version: 1, status: "partial" }),
  }),
});
```

Then assert the persistence span ends after the transaction and a best-effort update writes the completed snapshot. Add separate cases proving:

- final update failure is logged and `persistAssistantOutput` still resolves;
- an idempotently reused assistant message does not overwrite its trace;
- calls without a collector preserve existing behavior.

- [ ] **Step 2: Run persistence tests and verify the new behavior fails**

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts
```

Expected: FAIL because no trace is written or finalized.

- [ ] **Step 3: Add the Prisma fields and migration**

In `MessageMetrics` add:

```prisma
  serverTrace Json?
  clientTrace Json?
```

Create the migration with only:

```sql
ALTER TABLE "MessageMetrics"
ADD COLUMN "serverTrace" JSONB,
ADD COLUMN "clientTrace" JSONB;
```

Do not add defaults, indexes, constraints, data rewrites, or scalar summary columns.

- [ ] **Step 4: Validate and regenerate Prisma**

```bash
bunx prisma validate
bunx prisma generate
```

Expected: schema validation and client generation succeed. Do not run a production migration.

- [ ] **Step 5: Implement two-phase server-trace persistence**

Add `traceCollector?: ServerTraceCollector` to `PersistAssistantOutputInput`. At the start of `persistAssistantOutput`, start `assistant_persistence`. Include `traceCollector.snapshot("partial")` in `buildMessageMetricsData` so Message and MessageMetrics remain atomic.

After the transaction resolves:

```ts
persistenceSpan?.end("completed");
if (traceCollector && persisted.created) {
  const completedTrace = traceCollector.snapshot("completed");
  try {
    await prisma.messageMetrics.update({
      where: { messageId: message.id },
      data: { serverTrace: completedTrace as Prisma.InputJsonValue },
    });
  } catch (error) {
    persistenceLogger.warn(
      "profiler.server_trace_finalize_failed",
      "Failed finalizing server response trace",
      { messageId: message.id, errorName: error instanceof Error ? error.name : "unknown" },
    );
  }
}
```

On primary persistence failure, end the span as `failed`, then rethrow the original persistence error. The final update is excluded from `serverTrace.totalMs` by construction.

- [ ] **Step 6: Run schema and persistence checks**

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts src/lib/response-profiler/server-trace.test.ts
bunx biome check src/lib/channel-flow/types.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts
git diff --check -- prisma/schema.prisma prisma/migrations/20260812150000_add_response_profiler_traces/migration.sql src/lib/channel-flow/types.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit storage and finalization**

```bash
git add -- prisma/schema.prisma prisma/migrations/20260812150000_add_response_profiler_traces/migration.sql src/lib/channel-flow/types.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts
git commit -m "feat(profiler): persist server response traces"
```

### Task 4: Create and propagate the Web request collector

**Files:**

- Modify: `src/lib/channel-flow/types.ts`
- Modify: `src/lib/channel-flow/run.ts`
- Modify: `src/lib/channel-flow/run.test.ts`
- Modify: `src/lib/channels/web/chat-route-handler.ts`
- Modify: `src/app/api/chat/route.test.ts`

**Interfaces:**

- `InboundContext.execution.traceCollector?: ServerTraceCollector` is the sole request-scoped carrier.
- The authenticated Web route creates exactly one collector and the channel flow passes the same instance to `streamChat` and `persistAssistantOutput`.

- [ ] **Step 1: Read local Next.js route and streaming docs completely**

```bash
cat node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
cat node_modules/next/dist/docs/01-app/02-guides/streaming.md
```

Expected: PUT is supported by Route Handlers, non-GET handlers are not cached, and the response stream lifecycle must remain driven by the existing native `Response` path.

- [ ] **Step 2: Write failing propagation tests**

In `run.test.ts`, pass a fake collector through `ctx.execution` and assert the same object reaches both mocked `streamChat` and `persistAssistantOutput`. Add a cancellation test asserting the generation abort path calls `markCancelled`, so any subsequently persisted partial response retains `serverTrace.status === "cancelled"`.

In `route.test.ts`, mock `createServerTraceCollector` and assert one instance is created per authenticated POST and passed to `runChannelFlow`. Verify unauthenticated and rejected requests do not expose a trace payload in their HTTP response.

- [ ] **Step 3: Run the tests and verify propagation is absent**

```bash
bunx vitest run src/lib/channel-flow/run.test.ts src/app/api/chat/route.test.ts
```

Expected: FAIL on the new collector expectations.

- [ ] **Step 4: Thread the collector without changing channel behavior**

Add the optional collector to `InboundContext.execution` and `StreamChatOptions`. In `runChannelFlow`, pass it to `streamChat` and to every `persistAssistantOutput` call through `persistGeneratedOutput`.

At Web handler entry:

```ts
const traceCollector = createServerTraceCollector();
```

Pass it to the normal authenticated text-stream channel flow:

```ts
execution: {
  mode: "stream",
  abortSignal: request.signal,
  includeTechnicalMetrics,
  traceCollector,
},
```

Also add the collector and technical-metrics visibility to `handleVoiceFirstWebResponse`, pass it through its text-mode `runChannelFlow`, and pass it to the canonical `persistAssistantOutput` call so voice-first responses receive a server trace. Keep guest and idempotent replay paths unchanged. Keep model-comparison streams outside per-message trace persistence because they have two experiment responses rather than one canonical assistant `MessageMetrics` row; do not manufacture a synthetic assistant row.

- [ ] **Step 5: Instrument route-owned work with the same collector**

Nest collector measurement around the existing operations; retain `LatencyLogger` during rollout. Map only these route-owned phases:

- Clerk resolution -> `auth`;
- internal user lookup/upsert -> `user_lookup`;
- chat ownership and conversation-thread lookup -> `chat_lookup`;
- stale subscription refresh -> `billing_sync`;
- rate-limit check and reservation setup -> `rate_limit`;
- attachment ownership/canonicalization -> `attachment_resolution`;
- inbound idempotency lookup/claim -> `inbound_claim`;
- audio transcription -> `transcription`.

Do not trace title generation, voice generation, arbitrary HTTP parsing, or background tasks. For early rejection, leave the collector in memory only; do not synthesize an assistant message.

- [ ] **Step 6: Run focused route/flow checks**

```bash
bunx vitest run src/app/api/chat/route.test.ts src/lib/channel-flow/run.test.ts src/lib/channel-flow/persistence.test.ts
bunx biome check src/lib/channel-flow/types.ts src/lib/channel-flow/run.ts src/lib/channel-flow/run.test.ts src/lib/channels/web/chat-route-handler.ts src/app/api/chat/route.test.ts
git diff --check -- src/lib/channel-flow/types.ts src/lib/channel-flow/run.ts src/lib/channel-flow/run.test.ts src/lib/channels/web/chat-route-handler.ts src/app/api/chat/route.test.ts
```

Expected: all pass and the same collector identity is preserved end to end.

- [ ] **Step 7: Commit Web collector propagation**

```bash
git add -- src/lib/channel-flow/types.ts src/lib/channel-flow/run.ts src/lib/channel-flow/run.test.ts src/lib/channels/web/chat-route-handler.ts src/app/api/chat/route.test.ts
git commit -m "feat(profiler): trace web request setup"
```

### Task 5: Instrument orchestration, actual attempts, streaming, and tools

**Files:**

- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/rag.ts`
- Modify: `src/lib/ai/rag.test.ts`
- Modify: `src/lib/ai/recall-context.ts`
- Modify: `src/lib/ai/recall-context.test.ts`
- Modify: `src/lib/response-profiler/server-trace.test.ts`
- Modify: `src/lib/channel-flow/run.test.ts`
- Modify: `src/lib/ai/telemetry.test.ts`

**Interfaces:**

- `streamChat` consumes the optional request collector.
- Existing route trace remains authoritative for policy and escalation; the new spans identify the actual timed operations and their relative overlap.

- [ ] **Step 1: Add failing extracted-instrumentation tests**

Without touching the dirty `orchestrator.test.ts`, extend the collector tests and clean channel-flow tests to require:

- a Light attempt that fails before text and a Standard attempt that completes, with two attempt-tagged `model_stream` spans and the delivered Standard model/provider attributes;
- `markFirstToken` called only for the first non-empty text delta across all attempts;
- two concurrent context operations with overlapping offsets;
- RAG query embedding and vector lookup appear as distinct `rag_embedding` and `rag_search` spans without query/chunk content;
- every tool invocation represented by its own `tool` span, including `not_allowed`, failure, and success outcomes;
- an abort closing open provider/model/tool spans as `cancelled`;
- existing `$ai_generation` telemetry remains content-safe and never receives the full trace.

If direct orchestrator wiring cannot be exercised without the dirty test file, export small instrumentation helpers from `server-trace.ts` and test those there; do not weaken the production integration.

- [ ] **Step 2: Run focused tests and confirm missing orchestration spans**

```bash
bunx vitest run src/lib/response-profiler/server-trace.test.ts src/lib/channel-flow/run.test.ts src/lib/ai/telemetry.test.ts
```

Expected: FAIL on attempt/tool/context span expectations.

- [ ] **Step 3: Instrument preparation and context phases**

Use `traceCollector.measure` at the operation owner, not around duplicate outer blocks:

- turn arbitration/classifier -> `classification`;
- routing decision construction -> `routing`;
- conversation history fetch -> `history`;
- user profile/preferences -> `user_context`;
- durable fact fetch inside `buildRecallContext` -> `memory_facts`;
- historical evidence lookup inside `buildRecallContext` -> `conversation_recall`;
- RAG eligibility -> `rag_decision`;
- query embedding inside `searchDocumentsWithOutcome` -> `rag_embedding`;
- vector/document retrieval inside `searchDocumentsWithOutcome` -> `rag_search`, adding only `ragChunkCount` when the span closes;
- final system/messages assembly -> `prompt_build`.

Add an optional `traceCollector` argument to `buildRecallContext` and `getRagContext`, pass the request collector from the orchestrator, and instrument inside those operation owners. When operations run under `Promise.all`, start independent spans before awaiting them so overlap is retained. Do not create a parent span merely to make percentages add up.

- [ ] **Step 4: Instrument each actual model attempt**

For both Light and Standard paths, start `provider_wait` immediately before the provider/AI SDK call and `model_stream` for the complete attempt lifecycle. End `provider_wait` on the first non-empty generated text token, or at the terminal outcome when an attempt produces no text. Attach only:

```ts
{
  attemptSequence: 1,
  profile: "light",
  model: boundedActualModelId,
  provider: boundedActualProvider,
  outcome: "completed",
}
```

Use sequence `2` for the escalated Standard attempt. Merge the actual provider from validated completion metadata when the span closes; do not guess an upstream provider from the gateway name. Set outcome/status from the actual terminal path: `completed`, `failed_before_stream`, `failed_during_stream`, `empty_response`, or `cancelled`. Never relabel a failed Light attempt as the delivered Standard attempt.

In each existing `onChunk`, call `traceCollector?.markFirstToken()` only when `chunk.type === "text-delta" && chunk.text.length > 0`. Do not treat reasoning, tool calls, metadata, or an empty delta as first token.

- [ ] **Step 5: Instrument individual tool executions**

Extend `instrumentToolExecutions` with the optional collector. Start one `tool` span per invocation with only bounded `toolName`. Close it:

- completed + `not_allowed` when policy blocks execution;
- completed + `completed` on a normal result;
- failed + `failed_during_stream` when execution throws;
- cancelled + `cancelled` when the request signal aborts.

Retain the current aggregate `toolExecutionMs` accounting and outcome tracker.

- [ ] **Step 6: Preserve the existing telemetry privacy boundary**

Do not attach the in-progress request collector, `spans`, or serialized trace JSON to `$ai_generation`; that event is emitted before assistant persistence and therefore cannot truthfully report final server total time. Extend the existing telemetry test with a metrics object containing a synthetic `serverTrace` property and prove the captured call omits the full trace, prompts, tool payloads, and provider metadata. Durable final server timing remains in `MessageMetrics.serverTrace`.

- [ ] **Step 7: Run targeted AI checks**

```bash
bunx vitest run src/lib/response-profiler/server-trace.test.ts src/lib/channel-flow/run.test.ts src/lib/ai/rag.test.ts src/lib/ai/recall-context.test.ts src/lib/ai/telemetry.test.ts
bunx biome check src/lib/ai/orchestrator.ts src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/recall-context.ts src/lib/ai/recall-context.test.ts src/lib/ai/telemetry.test.ts src/lib/response-profiler/server-trace.ts src/lib/response-profiler/server-trace.test.ts src/lib/channel-flow/run.test.ts
git diff --check -- src/lib/ai/orchestrator.ts src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/recall-context.ts src/lib/ai/recall-context.test.ts src/lib/ai/telemetry.test.ts src/lib/response-profiler/server-trace.ts src/lib/response-profiler/server-trace.test.ts src/lib/channel-flow/run.test.ts
```

Expected: all pass. Also run the existing orchestrator test without editing it:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts
```

Expected: PASS with the user-owned test changes preserved.

- [ ] **Step 8: Commit orchestration instrumentation**

```bash
git add -- src/lib/ai/orchestrator.ts src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/recall-context.ts src/lib/ai/recall-context.test.ts src/lib/ai/telemetry.test.ts src/lib/response-profiler/server-trace.ts src/lib/response-profiler/server-trace.test.ts src/lib/channel-flow/run.test.ts
git commit -m "feat(profiler): trace ai execution spans"
```

### Task 6: Persist immutable client traces through an owner-correlated endpoint

**Files:**

- Create: `src/lib/response-profiler/client-trace-persistence.ts`
- Create: `src/lib/response-profiler/client-trace-persistence.test.ts`
- Create: `src/app/api/chat/messages/client-trace/route.ts`
- Create: `src/app/api/chat/messages/client-trace/route.test.ts`
- Modify: `src/lib/ai/telemetry.ts`
- Modify: `src/lib/ai/telemetry.test.ts`

**Interfaces:**

- Accepts `{ chatId, clientMessageId, trace }`; never accepts an assistant message id.
- Returns `stored`, `unchanged`, `pending`, `conflict`, `forbidden`, or `not_found` from the service so the route can map exact HTTP responses.

- [ ] **Step 1: Write failing persistence-service tests**

Cover:

- authenticated owner + private chat + generated response + empty `clientTrace` -> stores once;
- identical valid retry -> `unchanged`, no update;
- different valid retry -> `conflict`, no overwrite;
- inbound row exists but `generatedResponse` or `metrics` is missing -> `pending`;
- cross-user client id -> no target disclosure;
- owner of a public/shared chat -> `forbidden`;
- arbitrary assistant id in unknown input -> strict route validation fails;
- concurrent conditional update where another writer wins -> reread, then `unchanged` or `conflict`.

- [ ] **Step 2: Write failing route tests**

Assert:

```text
401 unauthenticated
400 malformed, oversized, unknown-key, or invalid-order trace
403 owned but non-private chat
404 no owner-correlated inbound message
409 retryable pending target with { retryable: true }
409 immutable conflicting trace with { retryable: false }
204 stored or identical retry
```

The route must call the service with the internal user id derived from Clerk, not with the Clerk id itself.

- [ ] **Step 3: Run tests and verify the endpoint is absent**

```bash
bunx vitest run src/lib/response-profiler/client-trace-persistence.test.ts src/app/api/chat/messages/client-trace/route.test.ts
```

Expected: FAIL because the service and route do not exist.

- [ ] **Step 4: Implement owner correlation and atomic immutability**

Resolve the target from the inbound message:

```ts
where: {
  userId,
  chatId,
  channel: "WEB",
  role: "USER",
  clientMessageId,
  chat: { userId, visibility: "PRIVATE" },
}
```

Select `generatedResponse.id`, its `metrics.messageId`, and existing `metrics.clientTrace`. Validate any existing JSON through `parseClientTrace` before comparing.

Use a conditional `messageMetrics.updateMany` constrained by `messageId` and database-null `clientTrace`. If the update count is zero, reread the row and compare normalized traces; this closes the concurrent retry race without allowing overwrites. Malformed pre-existing JSON is a conflict, not an overwrite opportunity.

- [ ] **Step 5: Implement the native PUT Route Handler**

Authenticate with Clerk first. Reject a declared `Content-Length` above 32 KiB, then read `request.text()` once, reject its UTF-8 byte length above 32 KiB, parse JSON, and validate the top-level body with `.strict()`. Resolve the internal user, call the service, and map the statuses above. Log only bounded ids and error names. Do not echo the submitted trace in the response.

- [ ] **Step 6: Emit privacy-safe client summary telemetry**

Add `captureClientTraceStored` in `telemetry.ts`. Emit `ai_client_response_trace` only after a new trace is stored, with owned-row values:

- `client_trace_status`;
- `first_delta_ms`;
- `first_visible_ms`;
- `perceived_completion_ms`;
- bounded model/provider and executed profile derived from persisted metrics/execution route.

Do not emit the complete trace, milestones object, chat content, or `clientMessageId`.

- [ ] **Step 7: Run endpoint and telemetry checks**

```bash
bunx vitest run src/lib/response-profiler/client-trace-persistence.test.ts src/app/api/chat/messages/client-trace/route.test.ts src/lib/ai/telemetry.test.ts
bunx biome check src/lib/response-profiler/client-trace-persistence.ts src/lib/response-profiler/client-trace-persistence.test.ts src/app/api/chat/messages/client-trace/route.ts src/app/api/chat/messages/client-trace/route.test.ts src/lib/ai/telemetry.ts src/lib/ai/telemetry.test.ts
git diff --check -- src/lib/response-profiler/client-trace-persistence.ts src/lib/response-profiler/client-trace-persistence.test.ts src/app/api/chat/messages/client-trace/route.ts src/app/api/chat/messages/client-trace/route.test.ts src/lib/ai/telemetry.ts src/lib/ai/telemetry.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit client-trace ingestion**

```bash
git add -- src/lib/response-profiler/client-trace-persistence.ts src/lib/response-profiler/client-trace-persistence.test.ts src/app/api/chat/messages/client-trace/route.ts src/app/api/chat/messages/client-trace/route.test.ts src/lib/ai/telemetry.ts src/lib/ai/telemetry.test.ts
git commit -m "feat(profiler): ingest client response traces"
```

### Task 7: Build browser collection and AI SDK transport instrumentation

**Files:**

- Create: `src/lib/response-profiler/client-trace.ts`
- Create: `src/lib/response-profiler/client-trace.test.ts`
- Create: `src/lib/response-profiler/profiling-chat-transport.ts`
- Create: `src/lib/response-profiler/profiling-chat-transport.test.ts`

**Interfaces:**

- One `ClientTraceCollector` exists per submitted browser user-message id.
- `ProfilingChatTransport` subclasses `DefaultChatTransport` and observes parsed `UIMessageChunk` values, preserving AI SDK stream semantics.

- [ ] **Step 1: Write failing client collector tests**

Inject `now`, `documentVisibility`, `requestAnimationFrame`, and `fetch`. Assert:

- `requestStartedMs` is always zero;
- each milestone records once even if called repeatedly;
- completion derives `completed` only when every milestone exists;
- hidden document suppresses `firstVisibleFrameMs` and produces `partial`;
- abandonment produces `abandoned`;
- submission uses `PUT`, JSON content type, credentials, and `keepalive: true`;
- only retryable `409` pending responses are retried with bounded backoff;
- validation/auth/conflict failures are not retried;
- submission errors resolve without throwing into chat UI.
- persistence resolving before the first visible frame defers immutable submission until the visible-frame milestone arrives;
- a one-second presentation-settle deadline submits a valid partial trace rather than waiting indefinitely.

Use a deterministic schedule such as delays `[150, 400, 900]` with at most four total attempts.

- [ ] **Step 2: Write failing transport tests**

Mock `super.sendMessages` through an injected base transport or fetch boundary. Feed parsed chunks:

```ts
{ type: "start", messageId: "assistant-1" }
{ type: "text-start", id: "text-1" }
{ type: "text-delta", id: "text-1", delta: "" }
{ type: "text-delta", id: "text-1", delta: "Ciao" }
{ type: "finish" }
```

Assert stream open when `super.sendMessages` resolves, first chunk once, first text delta only on `"Ciao"`, every chunk passed through unchanged, and completion/error/cancel forwarded without consuming or reparsing SSE twice.

- [ ] **Step 3: Run tests and confirm modules are absent**

```bash
bunx vitest run src/lib/response-profiler/client-trace.test.ts src/lib/response-profiler/profiling-chat-transport.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the client collector**

Use this narrow public API:

```ts
export interface ClientTraceCollector {
  readonly clientMessageId: string;
  markStreamOpened(): void;
  markFirstChunkReceived(): void;
  markFirstTextDeltaReceived(): void;
  markFirstDomText(): void;
  markFirstVisibleFrame(): void;
  markStreamCompleted(): void;
  markPersistedMessageResolved(): void;
  abandon(): void;
  waitForPresentation(options?: { timeoutMs?: number }): Promise<void>;
  snapshot(): ClientTraceV1;
}
```

Store the monotonic start privately. Clamp/round relative values before validation. Resolve `waitForPresentation` when the visible frame is recorded, immediately when the document becomes hidden, or after a default 1,000 ms deadline. The submission helper must accept `{ chatId, collector, fetchImpl? }`, await that presentation gate in the background, validate the snapshot before sending, and swallow terminal errors after bounded logging.

- [ ] **Step 5: Implement the transport subclass**

Override `sendMessages`, call `super.sendMessages(options)`, mark stream open when it resolves, and pipe the returned `ReadableStream<UIMessageChunk>` through `TransformStream`. For a normal submit, resolve the collector id from the last user message in `options.messages`; AI SDK leaves `options.messageId` undefined for a newly appended user message. Use `options.messageId` only for a replacement/regeneration path when it identifies that user message. Inspect `text-delta` chunks directly; do not parse HTTP bytes or duplicate AI SDK event-stream logic.

Memoization and collector lookup belong to the chat component in Task 8; the transport receives a callback such as:

```ts
getCollector: (clientMessageId: string | undefined) => ClientTraceCollector | undefined
```

- [ ] **Step 6: Run client module checks**

```bash
bunx vitest run src/lib/response-profiler/client-trace.test.ts src/lib/response-profiler/profiling-chat-transport.test.ts src/lib/response-profiler/contracts.test.ts
bunx biome check src/lib/response-profiler/client-trace.ts src/lib/response-profiler/client-trace.test.ts src/lib/response-profiler/profiling-chat-transport.ts src/lib/response-profiler/profiling-chat-transport.test.ts
git diff --check -- src/lib/response-profiler
```

Expected: all pass.

- [ ] **Step 7: Commit browser primitives**

```bash
git add -- src/lib/response-profiler/client-trace.ts src/lib/response-profiler/client-trace.test.ts src/lib/response-profiler/profiling-chat-transport.ts src/lib/response-profiler/profiling-chat-transport.test.ts
git commit -m "feat(profiler): collect browser response milestones"
```

### Task 8: Integrate client profiling into canonical authenticated Web responses

**Files:**

- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

**Interfaces:**

- Uses explicit AI SDK user-message ids so the collector key is known before `sendMessage` starts.
- Reconciles the persisted assistant through existing `sourceClientMessageId`, then asynchronously sends the trace.

- [ ] **Step 1: Add failing behavior tests**

Mock the profiling transport and client collector. Cover all four paths:

- normal submit;
- pending initial message;
- edit then resend;
- regenerate using the existing user message id.

For each, assert the client id is known and a collector is created immediately before `sendMessage`; unrelated preflight such as trial activation is not counted as request latency. Assert `sendMessage` receives the same explicit id. Add DOM timing tests proving:

- first non-empty streamed assistant text records `firstDomTextMs` after React commit;
- `requestAnimationFrame` records `firstVisibleFrameMs` only while visible;
- `onFinish` records stream completion;
- `refreshChatData` finds the assistant whose `sourceClientMessageId` matches the collector key, records persistence resolution, and submits once;
- the `refreshChatData`/trace PUT promise does not extend `isResponseSettling` or block the next send;
- a successful immutable PUT triggers one background reconciliation so the newly stored `clientTrace` appears in the current message panel without a page reload;
- guest chat uses the ordinary transport and never submits a client trace.
- a `data-modelComparison` response abandons and removes its collector because it has no single canonical assistant metrics target.

- [ ] **Step 2: Run the behavior test and verify profiling is not wired**

```bash
bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

Expected: FAIL on collector/transport/milestone expectations.

- [ ] **Step 3: Create stable ids and collectors before send**

Add a `Map<string, ClientTraceCollector>` ref and a helper that uses the existing Web id validation format. Reserve the id before any preflight when needed, but create/start the collector only after preflight and immediately before `sendMessage`; `requestStartedMs` means browser request initiation, not click-to-request setup. Pass the id through AI SDK's supported `CreateUIMessage.id` field:

```ts
const clientMessageId = createWebClientMessageId();
const collector = createClientTraceCollector({ clientMessageId });
clientTraceCollectorsRef.current.set(clientMessageId, collector);
await sendMessage({ id: clientMessageId, role: "user", parts });
```

For regenerate, reuse `userMessage.id` because the backend delete/recreate flow intentionally preserves the idempotency key. For edit resend, use the persisted/returned user id when available; otherwise generate one explicit replacement id. Abandon and remove the collector on terminal pre-stream error.

- [ ] **Step 4: Memoize and install the profiling transport**

Replace the render-time `new DefaultChatTransport` with `useMemo`. For guests instantiate `DefaultChatTransport`; for authenticated Web instantiate `ProfilingChatTransport` with a collector lookup backed by the ref. Keep `api`, `body: { chatId }`, AI SDK schemas, and throttling unchanged.

- [ ] **Step 5: Record React commit and visible-frame milestones**

In a focused `useEffect` watching `streamingMessages`, find the active assistant response and require non-empty text before marking DOM insertion. Immediately mark `firstDomTextMs`, then schedule one `requestAnimationFrame`; inside the callback require `document.visibilityState === "visible"` before marking `firstVisibleFrameMs`.

Do not pass profiler state through every message row and do not infer visible text from the request status alone. Cancel stale animation frames on chat change/unmount.

- [ ] **Step 6: Finalize and submit after persisted reconciliation**

Use the `onFinish` result to identify the completed active collector and mark stream completion. In the existing background `refreshChatData` continuation, locate:

```ts
message.role === "assistant" &&
message.sourceClientMessageId === collector.clientMessageId
```

Then mark `persistedMessageResolvedMs`, start the background submission coordinator, and delete the collector only after its bounded lifecycle completes. The coordinator waits for the visible-frame milestone, hidden-document resolution, or the one-second presentation deadline before it snapshots and PUTs `/api/chat/messages/client-trace`; this prevents an early immutable partial write when persistence wins the race against React paint. A pending target response is handled inside the submission helper; UI state must remain settled regardless.

Make the submission helper return a closed terminal result such as `stored`, `unchanged`, or `failed`. After `stored` or `unchanged`, perform one more background `refreshChatData` and `setMessages` reconciliation so the panel receives the server-authoritative `clientTrace` immediately. Do not await this refresh in `onFinish`, do not resubmit from it, and do not alter loading state.

If `onData` observes `data-modelComparison`, abandon and remove the active collector without calling the client-trace endpoint. The model-comparison system has two experiment responses and no single canonical assistant `MessageMetrics` target.

- [ ] **Step 7: Run client integration checks**

```bash
bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' src/lib/response-profiler/client-trace.test.ts src/lib/response-profiler/profiling-chat-transport.test.ts
bunx biome check 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' src/lib/response-profiler/client-trace.ts src/lib/response-profiler/profiling-chat-transport.ts
git diff --check -- 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' src/lib/response-profiler/client-trace.ts src/lib/response-profiler/profiling-chat-transport.ts
```

Expected: all pass.

- [ ] **Step 8: Commit chat-client integration**

```bash
git add -- 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' src/lib/response-profiler/client-trace.ts src/lib/response-profiler/profiling-chat-transport.ts
git commit -m "feat(chat): profile perceived response latency"
```

### Task 9: Expose validated traces through the existing protected APIs

**Files:**

- Modify: `src/lib/technical-metrics.ts`
- Modify: `src/lib/technical-metrics.test.ts`
- Modify: `src/types/chat.ts`
- Modify: `src/lib/chat.ts`
- Modify: `src/lib/chat.test.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/chats/[id]/route.test.ts`
- Modify: `src/app/api/chat/messages/route.ts`
- Modify: `src/app/api/chat/messages/route.test.ts`

**Interfaces:**

- `Usage.serverTrace?: ServerTraceV1` and `Usage.clientTrace?: ClientTraceV1` are available only after validated, authorized projection.
- Malformed persisted JSON is omitted rather than forwarded or repaired.

- [ ] **Step 1: Add failing technical-projection tests**

Extend `technical-metrics.test.ts` to prove:

```ts
expect(buildTechnicalUsage(messageWithValidTraces)).toEqual(
  expect.objectContaining({ serverTrace: validServerTrace, clientTrace: validClientTrace }),
);
expect(buildTechnicalUsage(messageWithMalformedTraces)).not.toHaveProperty("serverTrace");
expect(buildTechnicalUsage(messageWithMalformedTraces)).not.toHaveProperty("clientTrace");
expect(buildTechnicalUsage(messageWithValidTraces, { includeDiagnostics: false }))
  .not.toHaveProperty("serverTrace");
```

Add route/chat tests showing valid traces appear only for an authenticated private owner with technical metrics enabled, and never for unauthorized/shared/public views. In a non-development environment, explicitly prove a private owner whose preference/role enables technical metrics receives the detailed traces, while a user whose policy resolves false does not. Update exact Prisma select expectations to include both new fields.

- [ ] **Step 2: Run projection tests and verify trace fields are absent**

```bash
bunx vitest run src/lib/technical-metrics.test.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.test.ts
```

Expected: FAIL on the new trace selection/projection assertions.

- [ ] **Step 3: Extend the internal metric row and UI type**

Add `serverTrace?: unknown` and `clientTrace?: unknown` to `PersistedTechnicalMetricRow`. Add the inferred trace types to `Usage` via type-only imports. Parse each through Task 1 helpers only when `includeDiagnostics` is true.

Do not expose raw database JSON if parsing fails. Keep the existing scalar metrics available when traces are absent. Once `resolveTechnicalMetricsVisibility` has authorized a private owner, pass `includeDiagnostics: true` (or omit the option) in every read path instead of adding a second `NODE_ENV === "development"` gate; development remains automatically enabled through the visibility resolver, while preview/production honor the existing preference/role policy.

- [ ] **Step 4: Select the fields in all three read paths**

Add:

```ts
serverTrace: true,
clientTrace: true,
```

to each `MessageMetrics` select in `src/lib/chat.ts`, `src/app/api/chats/[id]/route.ts`, and `src/app/api/chat/messages/route.ts`. Do not change the visibility calculation; pass the selected row into the existing `buildTechnicalUsage` boundary.

- [ ] **Step 5: Run projection and privacy checks**

```bash
bunx vitest run src/lib/technical-metrics.test.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.test.ts
bunx biome check src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/types/chat.ts src/lib/chat.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts
git diff --check -- src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/types/chat.ts src/lib/chat.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts
```

Expected: all pass; malformed trace JSON and unauthorized diagnostics are absent from returned payloads.

- [ ] **Step 6: Commit protected trace projection**

```bash
git add -- src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/types/chat.ts src/lib/chat.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts
git commit -m "feat(chat): expose authorized response traces"
```

### Task 10: Derive trustworthy profiler summaries and timelines

**Files:**

- Create: `src/lib/response-profiler/summary.ts`
- Create: `src/lib/response-profiler/summary.test.ts`

**Interfaces:**

- Produces pure display data for the UI so timing semantics are tested independently from React markup.
- Does not merge clock domains or sum overlapping spans.

- [ ] **Step 1: Write failing derivation tests**

Cover complete, partial, and legacy inputs. Assert:

- quality is `complete` only when both traces are completed;
- any existing incomplete trace yields `partial`;
- no traces yields `legacy`;
- server TTFT comes from `serverTrace.timeToFirstTokenMs`, not `generationTimeMs`;
- first delta, first visible, and perceived completion come from client milestones;
- `outsideMeasuredBackendMs = max(0, firstVisibleFrameMs - serverTTFT)` and is never named network latency;
- model-stream throughput uses output tokens divided by the completed delivered-attempt `model_stream.durationMs`, returning null for zero/missing duration;
- two overlapping 100 ms spans inside a 120 ms total remain two rows and are not summed into a 200 ms total;
- dominant span means longest measured span only.

- [ ] **Step 2: Run the test and verify the module is missing**

```bash
bunx vitest run src/lib/response-profiler/summary.test.ts
```

Expected: FAIL because `summary.ts` does not exist.

- [ ] **Step 3: Implement pure display derivation**

Return one object with:

```ts
type ResponseProfilerSummary = {
  quality: "complete" | "partial" | "legacy";
  serverTtftMs?: number;
  firstDeltaMs?: number;
  firstVisibleMs?: number;
  perceivedCompletionMs?: number;
  persistedResolutionMs?: number;
  outsideMeasuredBackendMs?: number;
  outputTokensPerSecond?: number;
  dominantServerSpanId?: number;
  serverRows: Array<{
    id: number;
    label: string;
    startPercent: number;
    widthPercent: number;
    durationPercent: number;
    durationMs: number;
    status: "completed" | "failed" | "cancelled";
  }>;
  browserLanes: Array<{
    lane: "network" | "rendering" | "persistence";
    milestones: Array<{ key: string; offsetMs: number; offsetPercent: number }>;
  }>;
};
```

Clamp only presentation percentages, never stored values. Use a closed Italian label map for span and milestone names; do not display raw unknown keys.

- [ ] **Step 4: Run derivation checks**

```bash
bunx vitest run src/lib/response-profiler/summary.test.ts src/lib/response-profiler/contracts.test.ts
bunx biome check src/lib/response-profiler/summary.ts src/lib/response-profiler/summary.test.ts
git diff --check -- src/lib/response-profiler/summary.ts src/lib/response-profiler/summary.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit summary derivation**

```bash
git add -- src/lib/response-profiler/summary.ts src/lib/response-profiler/summary.test.ts
git commit -m "feat(profiler): derive response timeline summaries"
```

### Task 11: Render the detailed responsive profiler

**Files:**

- Create: `src/app/(chat)/components/technical-metrics/ProfilerSummary.tsx`
- Create: `src/app/(chat)/components/technical-metrics/ServerTimeline.tsx`
- Create: `src/app/(chat)/components/technical-metrics/BrowserTimeline.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx`

**Interfaces:**

- The existing `TechnicalMetricsDetails` remains the single message-level entry point.
- The new components consume already validated `Usage` and pure summary data; they never receive raw persisted JSON.

- [ ] **Step 1: Invoke the required frontend skills before editing**

Read and follow `impeccable` for the profiler composition. After TSX edits, read and run the review workflow from `vercel:react-best-practices`. Keep the approved existing visual language; this is a dense diagnostic surface, not a redesign of chat.

- [ ] **Step 2: Extend component tests first**

Add test fixtures for complete, partial, and legacy responses. Assert visible text labels:

- actual model, provider, and `Light`/`Standard` profile;
- `TTFT server`, `Primo delta`, `Primo testo visibile`, `Completamento percepito`, throughput, tokens, and cost;
- `Traccia completa`, `Traccia parziale`, or `Dati legacy`;
- separate `Timeline backend` and `Timeline browser` headings;
- `Fuori dal backend misurato`, never `Latenza di rete`;
- explanation that overlapping percentages are not additive;
- textual duration/status equivalents for every bar;
- partial traces omit missing values rather than rendering `0 ms`.

Use `userEvent.tab()` and Enter/Space to verify expandable controls are keyboard operable. Assert the root has `min-w-0 max-w-full overflow-hidden` and compact timeline rows do not require fixed viewport widths.

- [ ] **Step 3: Run the component test and verify the detailed view is missing**

```bash
bunx vitest run 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx'
```

Expected: FAIL on the new summary/timeline/accessibility assertions.

- [ ] **Step 4: Implement the compact summary**

Keep the existing `<details>` wrapper and execution/attempt/consumption/context sections. Insert a summary grid that uses the pure derivation from Task 10 and distinguishes:

- server TTFT — request receipt to first non-empty provider-generated text;
- first delta — browser request start to first non-empty text chunk;
- first visible — browser request start to the first visible-frame opportunity;
- perceived total — browser request start to stream completion;
- persistence resolved — browser request start to durable response reconciliation.

Use text and icons in addition to color for quality/status. Keep model ids truncatable with a `title` attribute and all numeric values tabular.

- [ ] **Step 5: Implement the backend waterfall**

Render one row per validated span with a CSS grid and an absolutely positioned proportional bar:

```tsx
style={{
  marginInlineStart: `${row.startPercent}%`,
  width: `${row.widthPercent}%`,
}}
```

Show start offset, duration, percent of total, and status in text. Group rows by setup, context, model, tool, and persistence using a closed span-name map. Parallel spans overlap horizontally. Mark the longest span as `Più lungo misurato`, not as the certain root cause.

- [ ] **Step 6: Implement separate browser lanes**

Render network, rendering, and persistence lanes normalized only to browser request start. Preserve the valid case where visible frame follows stream completion. Include the `Fuori dal backend misurato` residual with copy explaining that it can include request/response transit, SDK scheduling, throttling, React work, and paint opportunity.

On narrow screens, render labels, offsets, and compact proportional tracks within the container; do not add horizontal scrolling as a requirement for reading values.

- [ ] **Step 7: Preserve legacy and partial behavior**

When neither trace exists, retain the current compact legacy metrics and label them `Dati legacy`. When one or both traces are partial, render only available rows/milestones and show `Traccia parziale`; never infer missing times from aggregate metrics.

- [ ] **Step 8: Run frontend tests and reviews**

```bash
bunx vitest run 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' src/lib/response-profiler/summary.test.ts
bunx biome check 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' 'src/app/(chat)/components/technical-metrics/ProfilerSummary.tsx' 'src/app/(chat)/components/technical-metrics/ServerTimeline.tsx' 'src/app/(chat)/components/technical-metrics/BrowserTimeline.tsx'
git diff --check -- 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' 'src/app/(chat)/components/technical-metrics/ProfilerSummary.tsx' 'src/app/(chat)/components/technical-metrics/ServerTimeline.tsx' 'src/app/(chat)/components/technical-metrics/BrowserTimeline.tsx'
```

Expected: all pass and the React best-practices review has no unresolved findings.

- [ ] **Step 9: Commit the profiler UI**

```bash
git add -- 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' 'src/app/(chat)/components/technical-metrics/ProfilerSummary.tsx' 'src/app/(chat)/components/technical-metrics/ServerTimeline.tsx' 'src/app/(chat)/components/technical-metrics/BrowserTimeline.tsx'
git commit -m "feat(chat): render detailed response profiler"
```

### Task 12: Apply the development migration and verify the full system

**Files:**

- Verify all files from Tasks 1-11.
- Do not modify or stage unrelated user-owned files.

**Interfaces:**

- Confirms the persisted database shape, all test boundaries, a real authenticated localhost response, responsive layout, and failure isolation.

- [ ] **Step 1: Confirm the intended database target before migration**

Inspect environment names and host/database identifiers without printing credentials:

```bash
bun -e 'for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"]) { const value = process.env[key]; if (!value) { console.log(`${key}: missing`); continue; } const url = new URL(value); console.log(`${key}: host=${url.hostname} database=${url.pathname.slice(1)} sslmode=${url.searchParams.get("sslmode") ?? "unset"}`); }'
```

Expected: both URLs resolve to the intended development target. If the target is ambiguous or production-like, stop and request confirmation before applying the migration.

- [ ] **Step 2: Apply and inspect the development migration**

```bash
bunx prisma migrate dev
bunx prisma migrate status
```

Expected: `20260812150000_add_response_profiler_traces` is applied to development and migration status is current. Do not run `prisma migrate deploy` against production.

- [ ] **Step 3: Run focused regression suites**

```bash
bunx vitest run src/lib/response-profiler src/lib/channel-flow/persistence.test.ts src/lib/channel-flow/run.test.ts src/app/api/chat/route.test.ts src/app/api/chat/messages/client-trace/route.test.ts src/lib/technical-metrics.test.ts src/lib/chat.test.ts 'src/app/api/chats/[id]/route.test.ts' src/app/api/chat/messages/route.test.ts 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' src/lib/ai/telemetry.test.ts src/lib/ai/orchestrator.test.ts
```

Expected: all focused suites pass.

- [ ] **Step 4: Run repository verification**

```bash
bun run lint
bun run test
bun run build
```

Expected: all pass. If global lint reports only pre-existing unrelated files or `.impeccable/hook.cache.json`, run and report scoped Biome checks; do not edit generated cache merely to make lint green.

- [ ] **Step 5: Verify a real authenticated localhost response**

Use `next-dev-loop`. Start or reuse `bun run dev`, then use the attached T3 preview to open the actual authenticated private chat route. Send a normal message and verify:

- streaming still begins and completes normally;
- the persisted assistant row has a valid `serverTrace` and `clientTrace`;
- model/provider/profile match the actual delivered attempt;
- server TTFT, browser first delta, first visible frame, and perceived completion remain distinct;
- the server waterfall shows overlap without additive claims;
- no trace payload contains message content, prompts, tool payloads, raw provider metadata, URLs, or timestamps;
- a browser trace PUT failure does not restore a loading state or block the next message.

Inspect persisted values with a bounded Prisma query that selects only ids, status, timings, span names, and allowlisted attributes. Do not print message content or secrets.

- [ ] **Step 6: Verify desktop, mobile, and access boundaries**

In T3 preview, inspect at least one desktop viewport and `390x844`. Confirm no horizontal overflow, every timeline value has a text equivalent, and keyboard expansion works. Verify the detailed payload/panel is absent for guest and any available non-owner/shared route; if live identities are unavailable, rely on the route tests and state that limitation explicitly.

- [ ] **Step 7: Inspect final Git scope**

```bash
git status --short --branch
git diff --check
git diff --stat origin/main...HEAD
```

Expected: only intended profiler commits plus the already-existing branch commits are ahead; unrelated user-owned modifications remain unstaged and unchanged.

- [ ] **Step 8: Create a final verification commit only if verification required code changes**

If verification caused a real profiler fix, stage only its exact files and commit:

```bash
git commit -m "fix(profiler): harden response trace verification"
```

If no files changed, do not create an empty commit. Do not push, deploy, or apply a production migration without an explicit request.

## Final Acceptance Checklist

- [ ] Every newly completed canonical assistant response in authenticated private Web chat, including voice-first, attempts to persist a valid `serverTrace` in every environment.
- [ ] Every completed visible canonical assistant response in authenticated private Web chat attempts to attach a valid `clientTrace` asynchronously and refreshes the current panel after successful ingestion.
- [ ] Model-comparison streams do not create synthetic assistant rows or submit an uncorrelatable client trace.
- [ ] A partial server snapshot is atomic with assistant persistence, and finalization failure leaves chat successful.
- [ ] Client correlation starts from owned `clientMessageId`; the browser cannot target arbitrary assistant rows.
- [ ] Identical client retries are idempotent, conflicting traces are immutable, and pending persistence is bounded-retryable.
- [ ] Server TTFT, first browser delta, first visible frame, and perceived completion are separately named and measured.
- [ ] Light-to-Standard escalation preserves both actual attempts and attributes the delivered model/provider/profile correctly.
- [ ] Parallel spans retain offsets and are never presented as an additive latency decomposition.
- [ ] Strict schemas and API projection prevent content, arbitrary metadata, raw provider data, and malformed stored JSON from escaping.
- [ ] Historical messages remain readable and display `Dati legacy`; partial traces never substitute zero for missing measurements.
- [ ] Guests, non-owners, and public/shared viewers do not receive detailed trace data.
- [ ] Desktop and 390x844 layouts remain readable without mandatory horizontal scrolling.
- [ ] Focused tests, lint, full unit tests, build, development migration status, and authenticated localhost verification have current evidence.
- [ ] Production migration, deployment, push, and PR remain outside scope unless separately authorized.
