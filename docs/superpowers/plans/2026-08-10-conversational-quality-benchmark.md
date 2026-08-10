# Conversational Quality Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the canonical Reality Benchmark with a fixed-Luna offline baseline-versus-candidate workflow for conversational quality.

**Architecture:** Reuse `runRealityBenchmark()` and its database-backed executor. Add focused modules for synthetic conversational scenarios, versioned artifacts, blind pairwise judging, reporting, and a three-command CLI; keep production traffic and behavior unchanged.

**Tech Stack:** TypeScript, Bun, Vitest, AI SDK 7, Zod 4, Prisma/Neon, Biome.

## Global Constraints

- Fix the evaluated model at `openai/gpt-5.6-luna`; expose no model override.
- Land and review measurement plus baseline before changing prompt or planner behavior.
- Use curated synthetic Italian fixtures only; never copy tester data.
- Never target Production implicitly; reuse the explicit DB-mutation guard.
- Keep five conversational dimensions separate from safety, concision, usefulness, latency, and cost.
- Write artifacts under `docs/benchmarks/runs/`; do not add UI, flags, surveys, deployment, or production A/B allocation.
- Preserve unrelated changes and commit only each task's declared files.

---

### Task 1: Add Conversational Scenarios and Expectations

**Files:**
- Create: `src/lib/benchmark/conversation-scenarios.ts`
- Create: `src/lib/benchmark/conversation-scenarios.test.ts`
- Modify: `src/lib/benchmark/reality.ts:29-49`

**Interfaces:**
- Produces `ConversationalExpectations` and `CONVERSATIONAL_REALITY_SCENARIOS`.
- Extends `RealityScenarioTurn` with `conversationalExpectations?: ConversationalExpectations`.

- [ ] **Step 1: Write the failing scenario tests**

Test that the exported dataset has exactly ten `conversation-*` scenarios, at least two turns each, all five tags (`discovery`, `question-quality`, `context-continuity`, `naturalness`, `multi-turn-progression`), low/high anchors, rubrics, and expectations. Serialize fixtures and assert they contain no `@`, `clerk_`, or `user_` identifiers.

- [ ] **Step 2: Verify the test fails**

Run: `bunx vitest run src/lib/benchmark/conversation-scenarios.test.ts`

Expected: FAIL because `conversation-scenarios.ts` does not exist.

- [ ] **Step 3: Add the exact expectation type**

Add to `reality.ts`:

```ts
export type ConversationalExpectations = {
  adviceReadiness: "ask_first" | "answer_now";
  expectedContextFacts?: string[];
  forbiddenRepeatedQuestions?: string[];
  questionPolicy: "diagnostic" | "optional" | "none";
};
```

- [ ] **Step 4: Implement the ten synthetic scenarios**

Use IDs: `conversation-discovery-age`, `conversation-discovery-food`, `conversation-discovery-home`, `conversation-clarify-ambiguous`, `conversation-no-ritual-question`, `conversation-known-thread-fact`, `conversation-identity-correction`, `conversation-cross-chat-transparency`, `conversation-progress-beyond-routine`, and `conversation-gradual-specialization`. Cover the corresponding tester-derived archetype with original Italian wording and concrete anchors.

- [ ] **Step 5: Verify scenario and Reality tests**

Run: `bunx vitest run src/lib/benchmark/conversation-scenarios.test.ts src/lib/benchmark/reality.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/benchmark/conversation-scenarios.ts src/lib/benchmark/conversation-scenarios.test.ts src/lib/benchmark/reality.ts
git commit -m "test(benchmark): add conversational coaching scenarios"
```

---

### Task 2: Define Artifacts, Compatibility, and Structural Diagnostics

**Files:**
- Create: `src/lib/benchmark/conversation-benchmark.ts`
- Create: `src/lib/benchmark/conversation-benchmark.test.ts`

**Interfaces:**
- Produces `ConversationRunArtifact`, `ConversationComparisonArtifact`, `ConversationalDimensions`, `StructuralDiagnostics`, `diagnoseConversationStructure()`, and `assertCompatibleConversationRuns()`.
- Tasks 3–6 depend on these names and shapes.

- [ ] **Step 1: Write failing diagnostic and compatibility tests**

For `Capisco.\n\n- Uno\n- Due\n\nVuoi provarlo?`, assert formulaic opening, Markdown list, question, final question, and combined pattern are all true, with phrase hits `capisco` and `vuoi`. Build matching baseline/candidate fixtures and assert compatibility; independently vary artifact version, scenario version, model, sample count, scenario IDs, turn counts, and replica IDs and assert a field-specific error.

- [ ] **Step 2: Verify failure**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement stable public contracts**

```ts
export const CONVERSATION_ARTIFACT_VERSION = 1;
export const CONVERSATION_SCENARIO_VERSION = "conversation-v1";
export const CONVERSATION_MODEL_ID = "openai/gpt-5.6-luna";

export type ConversationalDimensions = {
  contextUse: number;
  conversationalNaturalness: number;
  discoveryBeforeAdvice: number;
  multiTurnProgression: number;
  questionQuality: number;
};

export type StructuralDiagnostics = {
  acknowledgmentListQuestion: boolean;
  endsWithQuestion: boolean;
  formulaicOpening: boolean;
  hasMarkdownList: boolean;
  hasQuestion: boolean;
  phraseHits: string[];
  wordCount: number;
};
```

`ConversationRunArtifact` must include version, variant, label, full Git commit, ISO creation date, fixed model, samples, sorted scenario IDs, non-secret configuration fingerprint, serialized Reality summary, and replicas keyed by scenario/turn/sample. Comparison verdicts are `baseline | candidate | tie | both_insufficient`.

- [ ] **Step 4: Implement strict compatibility and diagnostics**

Use a closed formula list: `capisco`, `certo`, `perfetto`, `è normale`, `prossima azione`, `vuoi`. Detect ordered/unordered Markdown lists and questions anywhere/end. Reject before judging unless variants, versions, fixed model, samples, scenario IDs, turn cardinality, and unique replica keys match exactly.

- [ ] **Step 5: Verify and commit**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark.test.ts`

Expected: PASS.

```bash
git add src/lib/benchmark/conversation-benchmark.ts src/lib/benchmark/conversation-benchmark.test.ts
git commit -m "feat(benchmark): define conversational comparison artifacts"
```

---

### Task 3: Implement Blind Pairwise Judging

**Files:**
- Create: `src/lib/benchmark/conversation-benchmark-judge.ts`
- Create: `src/lib/benchmark/conversation-benchmark-judge.test.ts`

**Interfaces:**
- Produces `assignBlindVariants()`, `buildConversationPairwiseJudgePrompt()`, and `judgeConversationPair()`.
- Consumes Task 2 contracts and `DEFAULT_REALITY_JUDGE_MODELS`.

- [ ] **Step 1: Write failing blind-order and leakage tests**

Assert identical `(scenarioVersion, scenarioId, turnIndex, replicaId)` tuples always produce the same A/B assignment. Across ten replica keys, assert both assignments occur. Assert the judge prompt contains scenario, previous synthetic transcript, A, B, anchors, and rubric but does not contain `baseline`, `candidate`, model ID, commits, or paths. Reject invalid verdicts and dimension scores outside 0–10.

- [ ] **Step 2: Verify failure**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark-judge.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic assignment**

Hash `${scenarioVersion}:${scenarioId}:${turnIndex}:${replicaId}` with SHA-256 and use the low bit of the first digest byte. Never use `Math.random()`.

- [ ] **Step 4: Implement the strict judge output**

```ts
{
  preferred: "A" | "B" | "tie" | "both_insufficient";
  dimensionsA: ConversationalDimensions;
  dimensionsB: ConversationalDimensions;
  reason: string;
  strengthsA: string[];
  strengthsB: string[];
  weaknessesA: string[];
  weaknessesB: string[];
  safetyRegression: "A" | "B" | "neither" | "both";
}
```

The Italian prompt must distinguish diagnostic from ritual questions, forbid rewarding verbosity alone, and explain all five dimensions.

- [ ] **Step 5: Execute exactly two independent judges**

Follow `reality-judge.ts`: AI SDK structured output, OpenRouter options, two attempts, timeout, and metric extraction. Reveal variant identity only after parsing. Flag opposite variant choices as disagreement; do not flag variant versus tie.

- [ ] **Step 6: Verify and commit**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark-judge.test.ts src/lib/benchmark/reality-judge.test.ts`

Expected: PASS.

```bash
git add src/lib/benchmark/conversation-benchmark-judge.ts src/lib/benchmark/conversation-benchmark-judge.test.ts
git commit -m "feat(benchmark): add blind conversational judging"
```

---

### Task 4: Run Replicas and Assemble Comparisons

**Files:**
- Create: `src/lib/benchmark/conversation-benchmark-runner.ts`
- Create: `src/lib/benchmark/conversation-benchmark-runner.test.ts`
- Modify: `src/lib/benchmark/reality.ts:51-63,1247-1335,1441-1608`

**Interfaces:**
- Produces `runConversationVariant()` and `buildConversationComparison()`.
- Adds optional `replicaId` to Reality executor inputs and metadata without changing existing callers.

- [ ] **Step 1: Write failing fake-executor tests**

Use a fake executor returning `${scenario.id}:${turnIndex}:${replicaId}` with positive duration and zero cost. Assert three samples generate `sample-1..3` for every scenario turn, all use fixed Luna, and incomplete/empty/error results make the artifact invalid. Inject fake judges and assert all four verdict categories, dimension averages, latency/cost deltas, and scenario detail aggregation.

- [ ] **Step 2: Verify failure**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark-runner.test.ts`

Expected: FAIL because runner and replica propagation do not exist.

- [ ] **Step 3: Propagate replica identity through Reality execution**

Add `replicaId?: string` to `RealityBenchmarkExecutor` input and `runRealityBenchmark()` options. Include it in the database executor context key, synthetic external ID, metadata, and chat title so samples never share state. Omitting it must preserve existing output.

- [ ] **Step 4: Implement variant runs**

`runConversationVariant()` accepts variant, label, commit, samples, configuration fingerprint, and `executorFactory(replicaId)`. Require samples >= 1; for each sample run only the fixed model and conversational scenarios, clean up in `finally`, serialize results, attach structural diagnostics, and reject empty text, benchmark errors, missing turns, or non-positive duration.

- [ ] **Step 5: Implement comparison assembly**

Validate compatibility first, pair exact replica keys, invoke both judges, and aggregate verdicts, five dimensions, structural diagnostics, existing guardrails, latency, cost, word count, and judge disagreement. Preserve complete synthetic scenario review data.

- [ ] **Step 6: Verify and commit**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/reality.test.ts src/lib/benchmark/reality-orchestrator.test.ts`

Expected: PASS.

```bash
git add src/lib/benchmark/conversation-benchmark-runner.ts src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/reality.ts
git commit -m "feat(benchmark): run replicated conversational variants"
```

---

### Task 5: Add Strict Reports and the Three-Command CLI

**Files:**
- Create: `src/lib/benchmark/conversation-benchmark-report.ts`
- Create: `src/lib/benchmark/conversation-benchmark-report.test.ts`
- Create: `src/lib/benchmark/conversation-benchmark-cli.ts`
- Create: `src/lib/benchmark/conversation-benchmark-cli.test.ts`
- Create: `scripts/run-conversation-benchmark.ts`
- Modify: `package.json:5-31`
- Modify: `docs/benchmarks/prelaunch-reality-benchmark.md`

**Interfaces:**
- Produces strict JSON serialization/parsing, `formatConversationComparisonReport()`, and subcommands `baseline`, `candidate`, `compare`.
- Reuses the Reality DB guard and sanitized target description.

- [ ] **Step 1: Write failing report and CLI tests**

Assert JSON round trips and Markdown headings: Decision Summary, Pairwise Results, Conversational Dimensions, Guardrail Deltas, Structural Diagnostics, Judge Disagreements, Scenario Review. Safety regressions must appear before gains; >5% concision/latency deterioration must say `ATTENTION`, never automatic failure.

Assert parsing of:

```text
baseline --label before --samples 3
candidate --baseline docs/benchmarks/runs/before.json --samples 3
compare --baseline docs/benchmarks/runs/before.json --candidate docs/benchmarks/runs/after.json --judge
```

Reject missing arguments, unknown flags, samples < 1, compare without `--judge`, judge-model counts other than two, and every model override. Baseline/candidate require mutation approval; compare does not.

- [ ] **Step 2: Verify failure**

Run: `bunx vitest run src/lib/benchmark/conversation-benchmark-report.test.ts src/lib/benchmark/conversation-benchmark-cli.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement strict artifact IO and Markdown**

Use strict Zod schemas. Reject unknown versions, invalid dates/numbers, incomplete counts, and secret-bearing fields named `apiKey`, `authorization`, `cookie`, `systemPrompt`, or `tracePayload`. The Markdown must show labels, commits, fixed model, versions, samples, costs, all verdicts/dimensions, guardrails, structural diagnostics, disagreements, and full synthetic A/B scenario review.

- [ ] **Step 4: Implement CLI parsing and executable**

Default to three samples, `docs/benchmarks/runs`, concurrency 1, and the existing two judge models. Require a baseline label, refuse overwrites, read Git via `execFile("git", ["rev-parse", "HEAD"])`, fingerprint only non-secret planner/scenario/model configuration, validate before writing, clean DB fixtures in `finally`, and never write a comparison until both judges finish.

Use filenames `conversation-YYYY-MM-DD-<label>-baseline.json`, `-candidate.json`, `-comparison.json`, and `-comparison.md`. Add package script:

```json
"benchmark:conversation": "bun run scripts/run-conversation-benchmark.ts"
```

- [ ] **Step 5: Document access and safety**

Update the Reality benchmark guide with exact baseline, candidate, compare, environment, cost, cleanup, and incompatibility behavior. Explicitly state that the tool is CLI-only and must not target Production.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bunx vitest run src/lib/benchmark/conversation-benchmark-report.test.ts src/lib/benchmark/conversation-benchmark-cli.test.ts src/lib/benchmark/reality-cli.test.ts
bun run benchmark:conversation --help
```

Expected: tests PASS and help exits 0 without DB access.

```bash
git add package.json docs/benchmarks/prelaunch-reality-benchmark.md scripts/run-conversation-benchmark.ts src/lib/benchmark/conversation-benchmark-report.ts src/lib/benchmark/conversation-benchmark-report.test.ts src/lib/benchmark/conversation-benchmark-cli.ts src/lib/benchmark/conversation-benchmark-cli.test.ts
git commit -m "feat(benchmark): expose conversational quality CLI"
```

---

### Task 6: Verify and Freeze the Pre-change Baseline

**Files:**
- Create after authorized live run: `docs/benchmarks/runs/conversation-2026-08-10-before-conversational-change-baseline.json`

**Interfaces:**
- Produces the reviewed baseline required before prompt/planner work.

- [ ] **Step 1: Run deterministic gates**

```bash
bun run lint
bun run typecheck
bun run test
git diff --check
```

Expected: all checks pass, with at least the initial 215 test files and 2,210 tests plus new coverage.

- [ ] **Step 2: Verify the target is not Production**

Use the CLI target-description output. If it resolves to Production, STOP and do not pass mutation approval. Use development or an explicitly created ephemeral Neon branch.

- [ ] **Step 3: Run one authorized smoke**

```bash
bun run benchmark:conversation baseline --label conversation-smoke --samples 1 --allow-db-mutation
```

Expected: fixed Luna, valid non-empty outputs, positive durations, measured cost, and complete cleanup. Leave an unwanted smoke artifact untracked and request explicit cleanup rather than deleting it implicitly.

- [ ] **Step 4: Run the frozen three-sample baseline**

```bash
bun run benchmark:conversation baseline --label before-conversational-change --samples 3 --allow-db-mutation
```

Expected: all ten scenarios/turns/replicas, fixed model, current commit, `conversation-v1`, structural diagnostics, no benchmark errors, and no secret fields.

- [ ] **Step 5: Review every flagged scenario manually**

Review premature-advice, identity/context, acknowledgment+list+question, empty/outlier, and safety cases. Confirm the synthetic baseline reproduces the tester-observed failure families; otherwise revise scenarios and regenerate before prompt work.

- [ ] **Step 6: Commit only the reviewed baseline**

```bash
git add docs/benchmarks/runs/conversation-2026-08-10-before-conversational-change-baseline.json
git commit -m "test(benchmark): record conversational quality baseline"
```

- [ ] **Step 7: Report boundaries**

Report implementation commits, baseline commit, tests, actual costs, database branch, cleanup status, push/deploy status, and tester-feedback status separately. State explicitly that prompt, planner, and production behavior remain unchanged.
