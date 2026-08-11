# Light DeepSeek Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute active production `light` turns with `deepseek/deepseek-v4-flash-0731` through a closed latency-routed provider pool while preserving the plan-resolved standard model for standard turns and escalations.

**Architecture:** Add one pure attempt-model resolver beside the execution-routing contracts, specialize the existing OpenRouter execution options for the DeepSeek light pair, and let the orchestrator resolve the model separately for each no-tool attempt. Store the attempt model ID with its observed stream state so delivered-generation metrics are attributed to the actual model.

**Tech Stack:** TypeScript, Vercel AI SDK 7, OpenRouter AI SDK provider, Vitest, Biome, Bun.

## Global Constraints

- The production light model ID is exactly `deepseek/deepseek-v4-flash-0731`.
- Standard execution continues to use the plan-resolved orchestrator model; the current primary is `openai/gpt-5.6-luna`.
- The DeepSeek light pool is exactly `Together`, `CoreWeave`, and `Ambient`, ordered by OpenRouter `sort: "latency"`.
- DeepSeek light provider fallbacks and `require_parameters` are always enabled.
- DeepSeek light prices are capped at `0.15` prompt and `0.30` completion per million tokens.
- Explicit benchmark model IDs remain authoritative for controlled comparisons.
- The existing single pre-stream light-to-standard escalation is the only profile retry.
- No schema, entitlement, classifier, channel contract, or plan-catalog change is allowed.

---

### Task 1: Resolve Models and Safe Provider Options Per Attempt

**Files:**
- Create: `src/lib/ai/execution-model.ts`
- Create: `src/lib/ai/execution-model.test.ts`
- Modify: `src/lib/ai/providers/openrouter-routing.ts`
- Modify: `src/lib/ai/providers/openrouter-routing.test.ts`

**Interfaces:**
- Produces: `LIGHT_EXECUTION_MODEL_ID: "deepseek/deepseek-v4-flash-0731"`.
- Produces: `resolveExecutionAttemptModelId(input: { profile: ExecutionProfile; standardModelId: string; explicitModelId?: string | null }): string`.
- Extends: `getOpenRouterProviderOptionsForExecution(modelId, profile, env)` so the exact DeepSeek-light pair receives the closed provider contract.

- [ ] **Step 1: Write failing model-resolution tests**

Add literal assertions proving light selects the production DeepSeek ID, standard selects the supplied standard ID, and an explicit benchmark ID wins for either profile:

```ts
expect(resolveExecutionAttemptModelId({
  profile: "light",
  standardModelId: "openai/gpt-5.6-luna",
})).toBe("deepseek/deepseek-v4-flash-0731");

expect(resolveExecutionAttemptModelId({
  profile: "standard",
  standardModelId: "openai/gpt-5.6-luna",
})).toBe("openai/gpt-5.6-luna");

expect(resolveExecutionAttemptModelId({
  profile: "light",
  standardModelId: "openai/gpt-5.6-luna",
  explicitModelId: "candidate/model",
})).toBe("candidate/model");
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `bunx vitest run src/lib/ai/execution-model.test.ts`

Expected: FAIL because `execution-model.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure resolver**

Create the constant and resolver with this decision order:

```ts
export const LIGHT_EXECUTION_MODEL_ID =
  "deepseek/deepseek-v4-flash-0731" as const;

export function resolveExecutionAttemptModelId(input: {
  profile: ExecutionProfile;
  standardModelId: string;
  explicitModelId?: string | null;
}) {
  return (
    input.explicitModelId ??
    (input.profile === "light"
      ? LIGHT_EXECUTION_MODEL_ID
      : input.standardModelId)
  );
}
```

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run: `bunx vitest run src/lib/ai/execution-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing DeepSeek provider-contract tests**

Extend `openrouter-routing.test.ts` with literal assertions that the exact light pair:

- returns `sort: "latency"`;
- removes a configured `order`;
- returns only `Together`, `CoreWeave`, and `Ambient`;
- enables fallbacks and required parameters;
- clamps a looser global price to `0.15` and `0.30`;
- preserves a stricter global price;
- intersects a narrower compatible global `only` list;
- throws when a configured `only` list has no safe provider;
- leaves standard and non-DeepSeek light options unchanged apart from the existing reasoning setting.

- [ ] **Step 6: Run the provider test and verify RED**

Run: `bunx vitest run src/lib/ai/providers/openrouter-routing.test.ts`

Expected: FAIL because DeepSeek light still inherits unrestricted model routing.

- [ ] **Step 7: Implement the closed provider contract**

In `getOpenRouterProviderOptionsForExecution`, apply a dedicated helper only when `profile === "light" && modelId === LIGHT_EXECUTION_MODEL_ID`. Destructure away `order`, intersect a configured `only` list with the safe pool, throw on an empty configured intersection, force latency sorting/fallbacks/required parameters, clamp price values with `Math.min`, retain compatible privacy constraints, and keep reasoning disabled.

- [ ] **Step 8: Run focused Task 1 tests and verify GREEN**

Run:

```bash
bunx vitest run src/lib/ai/execution-model.test.ts src/lib/ai/providers/openrouter-routing.test.ts
```

Expected: both files pass.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/lib/ai/execution-model.ts src/lib/ai/execution-model.test.ts src/lib/ai/providers/openrouter-routing.ts src/lib/ai/providers/openrouter-routing.test.ts
git commit -m "feat(ai): define DeepSeek light execution"
```

---

### Task 2: Execute and Attribute Each Profile With Its Own Model

**Files:**
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`

**Interfaces:**
- Consumes: `resolveExecutionAttemptModelId(...)` from Task 1.
- Preserves: `streamChat(...)` public API and immutable `TurnPlan`/`TurnDecision` contracts.
- Extends internal `NoToolAttemptState` with `modelId: string`.

- [ ] **Step 1: Write the failing active-light behavior test**

Extend the existing active-light test to assert that `getModelById` receives `deepseek/deepseek-v4-flash-0731`, the first `streamText` call receives that returned model, and its provider options contain the exact safe pool and caps.

- [ ] **Step 2: Write the failing escalation and attribution test**

Extend the empty-light escalation test so `getModelById` returns a distinct DeepSeek model object and `getModelForUser` returns a distinct standard model object. Assert the two `streamText` calls use those objects in order, and after consuming the stream assert:

```ts
expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
  "google/gemini-test",
  expect.any(Number),
  expect.objectContaining({ text: "Standard" }),
);
```

This literal standard ID comes from the test's plan-model stub and proves the delivered fallback is not attributed to DeepSeek.

- [ ] **Step 3: Write the failing successful-light attribution test**

Consume a successful active-light stream with `onFinish` and assert `extractAIMetrics` receives `deepseek/deepseek-v4-flash-0731`.

- [ ] **Step 4: Write the failing benchmark-preservation test**

Run an active-light turn with `benchmarkModelId: "candidate/model"` and assert both the created model and provider options remain candidate-scoped rather than receiving the production DeepSeek pool.

- [ ] **Step 5: Run the orchestrator tests and verify RED**

Run only the four named tests with:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts -t "active light|empty light|benchmark model"
```

Expected: FAIL because the orchestrator currently reuses one model object and model ID for both profiles.

- [ ] **Step 6: Implement per-attempt model resolution**

In the no-tool profiled branch:

1. resolve `attemptModelId` for each profile;
2. reuse the existing base model for standard or explicit benchmark attempts;
3. create `getModelById(attemptModelId)` only for the production light attempt;
4. pass the attempt model and attempt model ID into `streamText` and `getOpenRouterProviderOptionsForExecution`;
5. store `modelId` in `NoToolAttemptState`;
6. call `extractAIMetrics(deliveredState.modelId, ...)`.

Do not change standard, direct-media, prepared-comparison, or tool-loop execution branches.

- [ ] **Step 7: Run the focused orchestrator tests and verify GREEN**

Run:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts -t "active light|empty light|benchmark model"
```

Expected: all selected tests pass.

- [ ] **Step 8: Run all routing-adjacent tests**

Run:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/profiled-stream.test.ts src/lib/ai/execution-routing.test.ts src/lib/ai/execution-route-trace.test.ts src/lib/ai/telemetry.test.ts src/lib/ai/cost-calculator.test.ts src/lib/ai/providers/openrouter-routing.test.ts src/lib/ai/execution-model.test.ts
```

Expected: all files pass.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts
git commit -m "feat(ai): route light turns through DeepSeek"
```

---

### Task 3: Documentation and Final Gates

**Files:**
- Modify: `docs/ai-system.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Documents the runtime behavior implemented by Tasks 1 and 2; no runtime interface is added.

- [ ] **Step 1: Update the AI system documentation**

Replace the model-unspecified light-execution description with the exact production mapping, safe provider pool, benchmark override, and standard escalation behavior. Leave the general plan fallback table unchanged because it is outside this feature.

- [ ] **Step 2: Add a concise changelog entry**

Record that active light attempts now use DeepSeek V4 Flash 0731 with a latency-routed safe provider pool while standard turns and escalations retain the standard model.

- [ ] **Step 3: Run formatter and static gates**

Run:

```bash
bunx biome check --write src/lib/ai/execution-model.ts src/lib/ai/execution-model.test.ts src/lib/ai/providers/openrouter-routing.ts src/lib/ai/providers/openrouter-routing.test.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts docs/ai-system.md CHANGELOG.md
bun run typecheck
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 4: Run the full unit suite**

Run: `bun run test`

Expected: zero failing test files and zero failing tests.

- [ ] **Step 5: Commit documentation and formatting**

```bash
git add docs/ai-system.md CHANGELOG.md
git commit -m "docs(ai): document DeepSeek light routing"
```

- [ ] **Step 6: Verify final repository state**

Run:

```bash
git status --short --branch
git log -5 --oneline
```

Expected: clean worktree on the feature branch with the design, implementation plan, implementation, tests, and documentation commits present. Do not push or deploy without a separate user request.
