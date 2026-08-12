# Structured Light Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit fully safe, self-contained text transformations to the `light` profile even when the classifier's redundant `suggestedProfile` is `standard`.

**Architecture:** Keep all existing fail-closed and deterministic guards in `normalizeExecutionDecision`. Add one narrow predicate for the five approved transformation task kinds and require the explicit classifier suggestion only for other tasks.

**Tech Stack:** TypeScript, Vitest, Biome, Bun.

## Global Constraints

- Apply the override only to `rewrite`, `translate`, `format`, `extract`, and `summarize_supplied`.
- Keep `LIGHT_MIN_CONFIDENCE` at `0.9`.
- Preserve every existing capability, uncertainty, coaching, external knowledge, context, media, voice, approval, token-limit, and supplied-text veto.
- Keep `suggestedProfile` binding for `social` and all non-transformation task kinds.
- Do not change downstream planning, execution, retry, persistence, or telemetry contracts.

---

### Task 1: Derive safe transformation eligibility from structured dimensions

**Files:**
- Modify: `src/lib/ai/execution-routing.ts`
- Test: `src/lib/ai/execution-routing.test.ts`

**Interfaces:**
- Consumes: `WorkloadProposal.taskKind`, `WorkloadProposal.suggestedProfile`, and the existing `normalizeExecutionDecision` guards.
- Produces: unchanged `normalizeExecutionDecision(input): ExecutionDecision` behavior with a narrow profile-suggestion exception for safe transformations.

- [ ] **Step 1: Write the failing policy tests**

Add one positive case proving a fully safe rewrite remains eligible when
`suggestedProfile` is `standard`, plus one negative case proving `social`
still requires `suggestedProfile=light`:

```ts
it("uses structured dimensions for self-contained transformation eligibility", () => {
  expect(
    route({
      workload: {
        ...lightWorkload,
        contextDependency: "none",
        suggestedProfile: "standard",
      },
    }),
  ).toMatchObject({
    eligibleProfile: "light",
    reasonCodes: expect.arrayContaining(["classifier_standard"]),
  });
});

it("keeps the classifier profile suggestion binding for social turns", () => {
  expect(
    route({
      workload: {
        ...lightWorkload,
        taskKind: "social",
        contextDependency: "none",
        suggestedProfile: "standard",
      },
    }).eligibleProfile,
  ).toBe("standard");
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
bunx vitest run src/lib/ai/execution-routing.test.ts
```

Expected: the transformation test fails with `expected "standard" to be "light"`; the social guard test passes.

- [ ] **Step 3: Implement the minimal predicate**

Add a transformation-only task-kind predicate next to `isLightTaskKind`, then
replace the unconditional suggestion condition inside `lightEligible`:

```ts
const SELF_CONTAINED_TRANSFORM_TASK_KINDS = [
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
] as const;

function isSelfContainedTransformTaskKind(taskKind: TaskKind): boolean {
  return SELF_CONTAINED_TRANSFORM_TASK_KINDS.includes(
    taskKind as (typeof SELF_CONTAINED_TRANSFORM_TASK_KINDS)[number],
  );
}

const acceptsProfileSuggestion =
  workload?.suggestedProfile === "light" ||
  (workload !== null && isSelfContainedTransformTaskKind(taskKind));

const lightEligible =
  !hasFallbackFailure &&
  acceptsProfileSuggestion &&
  // retain every remaining existing condition unchanged
```

- [ ] **Step 4: Run focused routing and arbitration tests**

Run:

```bash
bunx vitest run src/lib/ai/execution-routing.test.ts src/lib/ai/turn-arbitration.test.ts src/lib/benchmark/turn-routing.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run scoped formatting and lint**

Run:

```bash
bunx biome check src/lib/ai/execution-routing.ts src/lib/ai/execution-routing.test.ts
```

Expected: both files pass without changes.

- [ ] **Step 6: Run the live routing evaluation**

Run:

```bash
bun run eval:turn-routing
```

Expected: zero protected false-light routes, no more than two false-standard
routes, and a target of all 12 expected-light fixtures routed to `light`.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/lib/ai/execution-routing.ts src/lib/ai/execution-routing.test.ts
git commit -m "fix(ai): derive light transforms from structured routing"
```

