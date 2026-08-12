# Local RAG and Tool Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record and render complete RAG evidence and tool input/output for locally generated chat responses while keeping raw diagnostics absent from preview and production.

**Architecture:** Add a separate versioned `developerDiagnostics` contract and bounded serializer instead of putting raw values in the safe `serverTrace`. A development-only collector is passed through RAG and tool execution, persisted in a nullable `MessageMetrics` JSON column, parsed defensively at readback, and rendered in a dedicated expandable profiler section.

**Tech Stack:** TypeScript, Next.js 16.3 App Router, Vercel AI SDK, Prisma 7/PostgreSQL, Zod, React, Vitest, Testing Library, Biome.

## Global Constraints

- Collect and expose raw diagnostics only when `NODE_ENV === "development"`.
- Do not use hostname checks as the security boundary.
- Keep `serverTrace` compact and free of query, chunk, input, or output content.
- Diagnostic serialization and persistence must never fail the chat response.
- Keep existing aggregate production fields and historical-message behavior unchanged.
- Do not log or send raw diagnostics to PostHog.
- Render diagnostic content as text, never HTML.
- Apply bounded depth, collection, string, per-value, and total-payload limits with explicit truncation markers.

---

## File Structure

- `src/lib/response-profiler/developer-diagnostics.ts`: versioned contract, bounded serializer, parser, development gate, mutable request collector, and snapshot logic.
- `src/lib/response-profiler/developer-diagnostics.test.ts`: contract, serializer, environment, ordering, error, and truncation tests.
- `src/lib/ai/rag.ts`: return the exact retrieved chunk projection and capture the effective query without another query.
- `src/lib/ai/rag.test.ts`: RAG diagnostic projection and failure coverage.
- `src/lib/ai/orchestrator.ts`: create the local collector, instrument tool boundaries, attach snapshots to final metrics, and record classic/agentic RAG outcomes.
- `src/lib/ai/orchestrator.test.ts`: development collection and production absence at the orchestration boundary.
- `src/lib/ai/cost-calculator.ts`: carry the already-bounded snapshot through `AIMetrics` without reconstructing raw values.
- `src/lib/ai/cost-calculator.test.ts`: development snapshot preservation and absent-value behavior.
- `prisma/schema.prisma`: nullable `developerDiagnostics Json?` on `MessageMetrics`.
- `prisma/migrations/20260812203000_add_developer_diagnostics/migration.sql`: additive nullable column migration.
- `src/lib/channel-flow/persistence.ts`: persist `AIMetrics.developerDiagnostics` only when the current server is in development.
- `src/lib/channel-flow/persistence.test.ts`: positive development persistence and negative production persistence.
- `src/lib/technical-metrics.ts`: select, parse, and expose diagnostics only in development.
- `src/lib/technical-metrics.test.ts`: malformed/version/environment readback coverage.
- `src/types/chat.ts`: shared UI type for parsed developer diagnostics.
- `src/lib/chat.ts`, `src/app/api/chat/messages/route.ts`, `src/app/api/chats/[id]/route.ts`: select the new field where message metrics are loaded.
- Relevant route tests: assert the field is selected locally but raw diagnostics remain governed by `buildTechnicalUsage`.
- `src/app/(chat)/components/technical-metrics/RagToolDiagnostics.tsx`: dedicated RAG/tool detail surface with safe text rendering and copy controls.
- `src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx`: rendering, expansion, copy, errors, and hostile-string coverage.
- `src/app/(chat)/components/TechnicalMetricsDetails.tsx`: place the new section between timelines and aggregate consumption/context sections.
- `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx`: integrated rich and fallback presentation.

---

### Task 1: Versioned Local Diagnostic Contract and Collector

**Files:**
- Create: `src/lib/response-profiler/developer-diagnostics.ts`
- Create: `src/lib/response-profiler/developer-diagnostics.test.ts`

**Interfaces:**
- Produces: `DeveloperDiagnosticsV1`, `DeveloperDiagnosticRagChunk`, `DeveloperDiagnosticToolCall`, `createDeveloperDiagnosticsCollector(options?)`, `parseDeveloperDiagnostics(value)`, and `isDeveloperDiagnosticsEnabled()`.
- Collector methods: `recordRagDecision(...)`, `recordRagResult(...)`, `recordRagFailure(...)`, `startTool(name, input)`, and `snapshot()`.
- Tool handle methods: `complete(output)`, `fail(error)`, `cancel(error?)`, and `notAllowed()`.

- [ ] **Step 1: Write failing contract and serializer tests**

Add tests proving that a development collector preserves a RAG query/chunk and
ordered tool input/output, serializes `Error`, `Date`, `undefined`, binary and
cyclic values, and reports start offset plus duration from an injected clock.
Assert that hostile strings remain ordinary strings.

- [ ] **Step 2: Run the new test file and verify RED**

Run:

```bash
bunx vitest run src/lib/response-profiler/developer-diagnostics.test.ts
```

Expected: FAIL because the module and exported contract do not exist.

- [ ] **Step 3: Implement the bounded versioned contract and collector**

Use named limits:

```ts
export const MAX_DEVELOPER_DIAGNOSTICS_BYTES = 128 * 1024;
export const MAX_DEVELOPER_VALUE_BYTES = 32 * 1024;
export const MAX_DEVELOPER_STRING_CHARS = 24_000;
export const MAX_DEVELOPER_COLLECTION_ITEMS = 100;
export const MAX_DEVELOPER_VALUE_DEPTH = 8;
```

The serializer returns a JSON-compatible value plus a truncation flag. Snapshot
must parse its own output and, if the total limit is exceeded, progressively
truncate large tool outputs and chunk text while retaining names, statuses,
timings, query, source metadata, and an explicit marker.

- [ ] **Step 4: Add negative environment and malformed-payload tests**

Use `vi.stubEnv("NODE_ENV", "production")` to prove the factory returns no
collector or an inert collector whose snapshot is `undefined`. Prove
`parseDeveloperDiagnostics` rejects unsupported versions, invalid statuses,
negative timings, and oversized payloads.

- [ ] **Step 5: Run contract tests and verify GREEN**

Run:

```bash
bunx vitest run src/lib/response-profiler/developer-diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add src/lib/response-profiler/developer-diagnostics.ts src/lib/response-profiler/developer-diagnostics.test.ts
git commit -m "feat(profiler): add local developer diagnostics contract"
```

---

### Task 2: Capture RAG Evidence and Tool Boundaries

**Files:**
- Modify: `src/lib/ai/rag.ts`
- Modify: `src/lib/ai/rag.test.ts`
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `src/lib/ai/cost-calculator.ts`
- Modify: `src/lib/ai/cost-calculator.test.ts`

**Interfaces:**
- Consumes: `createDeveloperDiagnosticsCollector`, its RAG methods and
  `startTool(name, input)` from Task 1.
- Produces: optional `developerDiagnostics?: DeveloperDiagnosticsV1` on
  `AIMetrics` and `FinishResultInput`.
- Extends `RagSearchResult` with optional `documentId`, `documentTitle`,
  `chunkId`, and required existing `content`/`title`/`similarity` values.
- Extends `RagContext` with optional development-only `diagnostics` containing
  the effective query and exact filtered results.

- [ ] **Step 1: Write failing RAG projection tests**

Update the raw SQL fixture to return chunk/document identifiers and assert
`getRagContext("query")` returns the same filtered chunks, scores, titles, IDs,
and query in its diagnostic projection only in development. Assert failed and
empty searches remain distinct.

- [ ] **Step 2: Run the RAG test and verify RED**

```bash
bunx vitest run src/lib/ai/rag.test.ts
```

Expected: FAIL because `RagContext.diagnostics` and identifier columns are
missing.

- [ ] **Step 3: Implement RAG diagnostic projection**

Select `rc.id AS "chunkId"`, `rc."documentId" AS "documentId"`, and
`rd.title AS "documentTitle"` in the existing vector query. Return the exact
filtered rows already used to build context; do not issue another query. Guard
the projection with `isDeveloperDiagnosticsEnabled()`.

- [ ] **Step 4: Run RAG tests and verify GREEN**

```bash
bunx vitest run src/lib/ai/rag.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing orchestrator tool-lifecycle tests**

Test `instrumentToolExecutions` through the existing orchestration surface with
two calls: one completed structured output and one failed `Error`. Assert exact
input/output, execution order, statuses, start offsets, and durations appear in
`metrics.developerDiagnostics`. Add a production-mode case asserting the field
is absent. Add classic RAG used/empty/failed cases and the agentic `searchRag`
case.

- [ ] **Step 6: Run targeted orchestrator and cost tests and verify RED**

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.test.ts
```

Expected: FAIL because the collector is not wired into execution or metrics.

- [ ] **Step 7: Wire the collector through orchestration**

Create one collector per authenticated web turn. Pass it to
`instrumentToolExecutions`; start a tool diagnostic before policy checks and
finish it on completed, failed, cancelled, and not-allowed paths. Record the
classic RAG decision/query/result/failure from `ragPromise`; capture agentic RAG
through the same instrumented `searchRag` call. Attach one final bounded
snapshot immediately before `onFinish` receives metrics.

- [ ] **Step 8: Preserve the snapshot in `extractAIMetrics`**

Add optional typed fields to `AIMetrics` and `FinishResultInput`. Copy only a
snapshot already returned by `parseDeveloperDiagnostics`; never rebuild it from
redacted `collectedToolCalls`. Keep telemetry capture functions unaware of the
new field.

- [ ] **Step 9: Run targeted tests and verify GREEN**

```bash
bunx vitest run src/lib/ai/rag.test.ts src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit collection**

```bash
git add src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.ts src/lib/ai/cost-calculator.test.ts
git commit -m "feat(profiler): capture local rag and tool evidence"
```

---

### Task 3: Persist and Read Rich Diagnostics Safely

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812203000_add_developer_diagnostics/migration.sql`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`
- Modify: `src/lib/technical-metrics.ts`
- Modify: `src/lib/technical-metrics.test.ts`
- Modify: `src/types/chat.ts`
- Modify: `src/lib/chat.ts`
- Modify: `src/app/api/chat/messages/route.ts`
- Modify: `src/app/api/chat/messages/route.test.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/chats/[id]/route.test.ts`

**Interfaces:**
- Consumes: `DeveloperDiagnosticsV1` and `parseDeveloperDiagnostics` from Task
  1; `AIMetrics.developerDiagnostics` from Task 2.
- Produces: optional `Usage.developerDiagnostics?: DeveloperDiagnosticsV1`.

- [ ] **Step 1: Write failing persistence environment tests**

In development, assert `persistAssistantMessage` includes
`developerDiagnostics` as Prisma JSON. In production, pass the same metrics and
assert the create/update data omits it. Preserve existing safe traces in both
cases.

- [ ] **Step 2: Run persistence tests and verify RED**

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts
```

Expected: FAIL because the Prisma field and persistence mapping do not exist.

- [ ] **Step 3: Add the nullable Prisma field and migration**

Add:

```prisma
developerDiagnostics Json?
```

to `MessageMetrics`. Create an additive migration containing:

```sql
ALTER TABLE "MessageMetrics" ADD COLUMN "developerDiagnostics" JSONB;
```

Run:

```bash
bunx prisma validate
bunx prisma generate
```

Expected: both commands succeed.

- [ ] **Step 4: Implement environment-gated persistence**

Map only a successfully parsed diagnostics snapshot and only when
`isDeveloperDiagnosticsEnabled()` is true. Do not weaken or remove existing
message/tool privacy projections.

- [ ] **Step 5: Run persistence tests and verify GREEN**

```bash
bunx vitest run src/lib/channel-flow/persistence.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing technical readback and route-select tests**

Assert `buildTechnicalUsage` returns parsed diagnostics in development, omits
them in production, and omits malformed/unsupported payloads while preserving
the rest of `Usage`. Update message/chat API select expectations for the new
nullable column.

- [ ] **Step 7: Run readback tests and verify RED**

```bash
bunx vitest run src/lib/technical-metrics.test.ts src/lib/chat.test.ts 'src/app/api/chat/messages/route.test.ts' 'src/app/api/chats/[id]/route.test.ts'
```

Expected: FAIL because the field is not selected, parsed, typed, or returned.

- [ ] **Step 8: Implement typed local readback**

Add the Prisma selects, persisted-row field, parser call, and shared `Usage`
type. Gate readback with both `includeDiagnostics` and
`isDeveloperDiagnosticsEnabled()`. Do not return raw database JSON directly.

- [ ] **Step 9: Run readback tests and verify GREEN**

```bash
bunx vitest run src/lib/technical-metrics.test.ts src/lib/chat.test.ts 'src/app/api/chat/messages/route.test.ts' 'src/app/api/chats/[id]/route.test.ts'
```

Expected: PASS.

- [ ] **Step 10: Commit schema and persistence**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/types/chat.ts src/lib/chat.ts src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts'
git commit -m "feat(profiler): persist local developer diagnostics"
```

---

### Task 4: Render Full RAG and Tool Evidence

**Files:**
- Create: `src/app/(chat)/components/technical-metrics/RagToolDiagnostics.tsx`
- Create: `src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx`

**Interfaces:**
- Consumes: `Usage.developerDiagnostics` from Task 3 and existing
  `ResponseProfilerSummary.serverRows` for timeline context.
- Produces: `RagToolDiagnostics({ diagnostics, serverTrace })`.

- [ ] **Step 1: Write failing rich UI tests**

Render a fixture with used RAG, two chunks, one completed tool, one failed tool,
structured input/output, an error, timings, and truncation. Assert outcome,
query, source, score, full text, tool sequence/status/duration/interval, and
expandable Input/Output/Error labels. Include `<img onerror=...>` as content and
assert no image or executable node is created.

- [ ] **Step 2: Run component tests and verify RED**

```bash
bunx vitest run 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx'
```

Expected: FAIL because the component and rich section do not exist.

- [ ] **Step 3: Implement the RAG panel**

Use existing section spacing, borders, typography, primary yellow, and
`details/summary` controls. Show the outcome badge, query with copy button,
chunk count, and expandable rows with title/IDs, score, sequence, and pre-wrapped
text. Use `navigator.clipboard.writeText` with an accessible button name and a
non-blocking copied state.

- [ ] **Step 4: Implement the tool panel**

Render calls in sequence order. Show name, outcome, duration, and `start → end`.
Render string values as pre-wrapped text and structured values with
`JSON.stringify(value, null, 2)`. Keep Input/Output/Error collapsed by default;
show distinct missing output and truncation states.

- [ ] **Step 5: Integrate the section and legacy fallback**

Place `RagToolDiagnostics` after server/browser/legacy timelines and before
consumption. Keep the existing aggregate `Contesto e strumenti` section for all
messages; when rich diagnostics exist, label it `Riepilogo` to distinguish it
from evidence details.

- [ ] **Step 6: Run component tests and verify GREEN**

```bash
bunx vitest run 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx'
```

Expected: PASS.

- [ ] **Step 7: Commit the UI**

```bash
git add 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.tsx' 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx'
git commit -m "feat(chat): display local rag and tool evidence"
```

---

### Task 5: Full Verification and Local Runtime Proof

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified local RAG/tool profiler and clean branch state.

- [ ] **Step 1: Run focused profiler and persistence suites**

```bash
bunx vitest run src/lib/response-profiler src/lib/ai/rag.test.ts src/lib/ai/cost-calculator.test.ts src/lib/technical-metrics.test.ts src/lib/channel-flow/persistence.test.ts 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx'
```

Expected: PASS.

- [ ] **Step 2: Run repository verification**

```bash
bun run lint
bun run test
bun run build
```

Expected: Biome exits 0, all non-skipped tests pass, and Next production build
exits 0.

- [ ] **Step 3: Apply the development migration target and regenerate client**

Confirm the current `DATABASE_URL` points to development, then run:

```bash
bunx prisma migrate dev
bunx prisma generate
```

Expected: the additive migration is applied only to development and Prisma
Client generation succeeds. Do not apply it to Production in this task.

- [ ] **Step 4: Start the worktree dev server and inspect Next MCP**

Run `bun run dev -- -p 3001`, navigate through the shared T3 preview, then call
`/_next/mcp` `get_compilation_issues`, `get_errors`, and `get_page_metadata`.
Expected: no compilation or session errors and the active page is `/chat/[id]`.

- [ ] **Step 5: Create or inspect a rich local response**

Use an authenticated local turn that invokes `searchRag` plus at least one
additional tool. Verify the persisted `MessageMetrics.developerDiagnostics`
contains the query, exact chunks, tool input/output, statuses, and timings.
Verify the browser renders the same values and copy/expand controls work.

- [ ] **Step 6: Verify responsive layout and safe rendering**

Inspect at 1440×900 and 390×844. Assert document `scrollWidth === clientWidth`,
all bars/sections stay within the metrics card, long text wraps or scrolls
inside its own code block, and hostile test strings remain visible text.

- [ ] **Step 7: Re-run fresh verification after runtime fixes**

If Step 4–6 required edits, repeat `bun run lint`, `bun run test`, and
`bun run build`. Run `git diff --check` and confirm `git status --short` contains
only intended files before committing.

- [ ] **Step 8: Commit final verification fixes**

```bash
git add src/lib/response-profiler src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/lib/ai/cost-calculator.ts src/lib/ai/cost-calculator.test.ts prisma/schema.prisma prisma/migrations/20260812203000_add_developer_diagnostics src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/types/chat.ts src/lib/chat.ts src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts' 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.tsx' 'src/app/(chat)/components/technical-metrics/RagToolDiagnostics.test.tsx'
git commit -m "fix(profiler): finalize local rag and tool diagnostics"
```

Skip this commit when verification required no code changes. Do not push or
deploy unless the user explicitly asks.
