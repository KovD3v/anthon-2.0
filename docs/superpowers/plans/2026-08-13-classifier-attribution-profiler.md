# Classifier Attribution Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and display the model and actual OpenRouter-selected provider used by the turn classifier.

**Architecture:** Extend classifier results and arbitration with optional attribution, then copy it into the existing persisted `executionRoute` JSON trace. Reuse `extractSelectedProvider` for authoritative OpenRouter metadata and render the optional fields in the expanded profiler without changing its authorization boundary.

**Tech Stack:** TypeScript, Next.js 16 App Router, AI SDK, Zod, React, Vitest, Testing Library.

## Global Constraints

- The provider is the provider selected by OpenRouter, never the gateway or a configured preference.
- `classifierModel` and `classifierProvider` are optional bounded strings.
- Historical execution traces without either field remain valid.
- Compact metrics must not expose classifier attribution.
- Existing user changes in the dirty worktree must be preserved.

---

### Task 1: Capture classifier attribution

**Files:**
- Modify: `src/lib/ai/turn-classification.test.ts`
- Modify: `src/lib/ai/turn-classification.ts`
- Modify: `src/lib/ai/turn-arbitration.test.ts`
- Modify: `src/lib/ai/turn-arbitration.ts`

**Interfaces:**
- Consumes: `extractSelectedProvider(providerMetadata): string | undefined`.
- Produces: optional `classifierModel` and `classifierProvider` on `TurnClassificationResult` and `TurnArbitrationResult`.

- [ ] **Step 1: Write failing classifier and arbitration tests**

Assert that a successful classifier response with metadata `{ openrouter: { provider: "DeepInfra" } }` returns:

```ts
expect(result).toMatchObject({
  classifierModel: "nvidia/nemotron-3.5-lightning",
  classifierProvider: "DeepInfra",
});
```

Assert that arbitration propagates the same optional values and that a legacy path omits them.

- [ ] **Step 2: Verify the tests fail for missing attribution**

Run:

```bash
bunx vitest run src/lib/ai/turn-classification.test.ts src/lib/ai/turn-arbitration.test.ts
```

Expected: FAIL because the result lacks classifier model/provider attribution.

- [ ] **Step 3: Implement minimal attribution propagation**

Import `extractSelectedProvider`, add optional attribution fields to both result types, return `modelId` for an invoked classifier, and extract the provider only from `result.providerMetadata`:

```ts
classifierModel: modelId,
...(extractSelectedProvider(result.providerMetadata) ? {
  classifierProvider: extractSelectedProvider(result.providerMetadata),
} : {}),
```

Propagate those properties from `classification` through `arbitrateTurn`.

- [ ] **Step 4: Verify Task 1 tests pass**

Run the same targeted Vitest command and expect all tests to pass.

### Task 2: Persist attribution in execution routes

**Files:**
- Modify: `src/lib/ai/execution-route-trace.test.ts`
- Modify: `src/lib/ai/execution-route-trace.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/types/chat.ts`

**Interfaces:**
- Consumes: optional classifier attribution from `TurnArbitrationResult`.
- Produces: optional bounded `classifierModel` and `classifierProvider` in `ExecutionRouteTrace` and client `Usage`.

- [ ] **Step 1: Write failing trace and orchestrator tests**

Extend a valid trace fixture with:

```ts
classifierModel: "nvidia/nemotron-3.5-lightning",
classifierProvider: "DeepInfra",
```

Assert strict parsing retains both fields, legacy fixtures remain valid, oversized labels are rejected, and the orchestrator's terminal route contains propagated attribution.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
bunx vitest run src/lib/ai/execution-route-trace.test.ts src/lib/ai/orchestrator.test.ts
```

Expected: FAIL because strict route parsing and route construction do not recognize the fields.

- [ ] **Step 3: Implement the optional route fields**

Add bounded optional strings to the Zod schema and TypeScript types, then include them in every route built from arbitration:

```ts
classifierModel: boundedLabelSchema.optional(),
classifierProvider: boundedLabelSchema.optional(),
```

Use conditional spreads so absent values are not serialized.

- [ ] **Step 4: Verify Task 2 tests pass**

Run the same targeted Vitest command and expect all tests to pass.

### Task 3: Render classifier attribution

**Files:**
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.tsx`
- Modify: `src/lib/technical-metrics.test.ts`

**Interfaces:**
- Consumes: `usage.executionRoute.classifierModel` and `classifierProvider`.
- Produces: conditional “Modello classificatore” and “Provider classificatore” rows in the expanded profiler.

- [ ] **Step 1: Write failing rendering and privacy tests**

Render usage with classifier attribution and assert:

```ts
expect(screen.getByText("Modello classificatore")).toBeTruthy();
expect(screen.getByText("nvidia/nemotron-3.5-lightning")).toBeTruthy();
expect(screen.getByText("Provider classificatore")).toBeTruthy();
expect(screen.getByText("DeepInfra")).toBeTruthy();
```

Also assert compact technical metrics omit `executionRoute`, including the new nested values.

- [ ] **Step 2: Verify the UI test fails**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' src/lib/technical-metrics.test.ts
```

Expected: FAIL because the labels are not rendered.

- [ ] **Step 3: Add conditional profiler rows**

Render the model in a truncated code block and the provider through `MetricValue`, independently conditional on each field.

- [ ] **Step 4: Verify Task 3 tests pass**

Run the same targeted Vitest command and expect all tests to pass.

### Task 4: Complete verification and publication

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: completed classifier attribution feature.
- Produces: verified, documented, committed implementation.

- [ ] **Step 1: Document the profiler addition**

Add an Unreleased changelog entry stating that expanded traces now identify the turn classifier model and actual OpenRouter-selected provider.

- [ ] **Step 2: Run focused and project checks**

```bash
bunx vitest run src/lib/ai/turn-classification.test.ts src/lib/ai/turn-arbitration.test.ts src/lib/ai/execution-route-trace.test.ts src/lib/ai/orchestrator.test.ts 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' src/lib/technical-metrics.test.ts
bun run lint
bunx tsc --noEmit
```

Expected: all commands pass.

- [ ] **Step 3: Verify the running Next.js app**

Start `bun run dev`, check `/_next/mcp` compilation/runtime errors, then use the attached collaborative browser to create a new response and confirm both classifier labels appear when OpenRouter supplies attribution.

- [ ] **Step 4: Commit only scoped files**

```bash
git add CHANGELOG.md docs/superpowers/plans/2026-08-13-classifier-attribution-profiler.md src/lib/ai/turn-classification.ts src/lib/ai/turn-classification.test.ts src/lib/ai/turn-arbitration.ts src/lib/ai/turn-arbitration.test.ts src/lib/ai/execution-route-trace.ts src/lib/ai/execution-route-trace.test.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/types/chat.ts 'src/app/(chat)/components/TechnicalMetricsDetails.tsx' 'src/app/(chat)/components/TechnicalMetricsDetails.test.tsx' src/lib/technical-metrics.test.ts
git commit -m "feat(profiler): show classifier attribution"
```
