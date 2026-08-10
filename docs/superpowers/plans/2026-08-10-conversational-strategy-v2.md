# Conversational Strategy v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and evaluate a prompt-only conversational strategy v2 that preserves v1 naturalness while recovering diagnostic question quality and context continuity.

**Architecture:** Replace only the conversational strategy module in the full system prompt and retain Luna, TurnPlan, memory, RAG, scenarios, and baseline unchanged. Add bounded concurrency to pairwise judging so independent scenario/replica pairs execute faster while result ordering remains deterministic.

**Tech Stack:** TypeScript, Bun, Vitest, AI SDK 7, OpenRouter, Zod 4, Prisma/Neon, Biome.

## Global Constraints

- Keep the evaluated model fixed at `openai/gpt-5.6-luna`.
- Make no planner, schema, UI, allocation, Production, memory, or RAG changes.
- Use the existing ten synthetic Italian scenarios and three replicas.
- Run generation only against the configured development database.
- Preserve exact pair keys and deterministic output ordering under concurrency.
- Do not push, merge, deploy, or touch the main checkout.

---

### Task 1: Encode the v2 Response Decision Policy

**Files:**
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `src/lib/ai/orchestrator.ts:123-163`

**Interfaces:**
- Consumes: `prepareChatTurn()` and the existing full prompt module assembly.
- Produces: a full system prompt containing the v2 `CONVERSATIONAL DECISION POLICY` without changing runtime APIs.

- [ ] **Step 1: Write the failing prompt regression test**

Extend the existing conversational strategy test to require these exact behavioral clauses:

```ts
expect(prepared.systemPrompt).toContain("First decide whether you have enough context");
expect(prepared.systemPrompt).toContain("Do not suppress a useful diagnostic question merely to be concise");
expect(prepared.systemPrompt).toContain("Treat the user's latest identity or factual correction as authoritative");
expect(prepared.systemPrompt).toContain("give a small safe observation or principle, then ask one high-value diagnostic question");
expect(prepared.systemPrompt).toContain("Do not recycle the same routine");
```

Retain the assertions that the old mandatory acknowledgment, list, and final-question template is absent.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts -t "uses a conversational strategy"
```

Expected: FAIL because the v1 prompt does not contain the v2 decision and continuity clauses.

- [ ] **Step 3: Implement the minimal v2 prompt module**

Replace the current strategy text with a non-visible three-way decision policy:

```text
CONVERSATIONAL DECISION POLICY
- First decide whether you have enough context for advice that is actually tailored to the user. Do not announce this decision.
- If enough context is available, answer directly. A question is optional and must add diagnostic or reflective value.
- If decisive context is missing, give a small safe observation or principle, then ask one high-value diagnostic question before a detailed plan or personalized prescription.
- Do not suppress a useful diagnostic question merely to be concise. Different answers to a diagnostic question must lead to meaningfully different advice.
- Prefer one question at a time. Combine only tightly related missing facts when separating them would create needless turns.
- Treat the user's latest identity or factual correction as authoritative. Carry relevant known facts forward naturally and never ask for information already available.
- Be transparent about inaccessible conversations. Continue from context the user provides without pretending to have seen it.
- Do not recycle the same routine in different words. Across turns, deepen the understanding or specialize the advice.
- Do not follow a fixed acknowledgment-list-question template. Use empathy, bullets, and questions only when they improve this response.
```

- [ ] **Step 4: Verify and format**

Run:

```bash
bunx biome check --write src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts
bunx vitest run src/lib/ai/orchestrator.test.ts
git diff --check
```

Expected: 86 orchestrator tests pass and formatting is clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts
git commit -m "feat(ai): refine conversational discovery policy"
```

---

### Task 2: Add Bounded Concurrent Pairwise Judging

**Files:**
- Modify: `src/lib/benchmark/conversation-benchmark-runner.test.ts`
- Modify: `src/lib/benchmark/conversation-benchmark-runner.ts`
- Modify: `src/lib/benchmark/conversation-benchmark-cli.test.ts`
- Modify: `src/lib/benchmark/conversation-benchmark-cli.ts`
- Modify: `scripts/run-conversation-benchmark.ts`

**Interfaces:**
- Extends `buildConversationComparison()` with `pairConcurrency?: number`, defaulting to `4`.
- Extends compare CLI with `--concurrency N`, validated as a positive integer and defaulting to `4`.

- [ ] **Step 1: Write failing concurrency tests**

Add a runner test with delayed fake judges that tracks active pairs and asserts:

```ts
expect(maxActivePairs).toBeGreaterThan(1);
expect(maxActivePairs).toBeLessThanOrEqual(3);
expect(comparison.pairs.map((pair) => pair.key)).toEqual(
  baseline.replicas.map(conversationReplicaKey),
);
```

Add CLI assertions that compare defaults to `pairConcurrency: 4`, accepts `--concurrency 3`, and rejects `0`, negative, fractional, or non-numeric values.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
bunx vitest run src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/conversation-benchmark-cli.test.ts
```

Expected: FAIL because comparison execution is sequential and the CLI has no concurrency option.

- [ ] **Step 3: Implement bounded concurrency with stable ordering**

Use an indexed worker loop over baseline replicas. Allocate `pairs` as a fixed-length array, let at most `pairConcurrency` workers claim the next index, store each completed pair at its original index, and reduce judge cost after all workers finish. Validate `pairConcurrency` as a positive integer.

- [ ] **Step 4: Wire the CLI option**

Parse `--concurrency N` only for `compare`, default to `4`, include it in help text, and pass it to `buildConversationComparison()` as `pairConcurrency`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bunx biome check --write src/lib/benchmark/conversation-benchmark-runner.ts src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/conversation-benchmark-cli.ts src/lib/benchmark/conversation-benchmark-cli.test.ts scripts/run-conversation-benchmark.ts
bunx vitest run src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/conversation-benchmark-cli.test.ts src/lib/benchmark/conversation-benchmark-judge.test.ts src/lib/benchmark/conversation-benchmark-report.test.ts
bun run typecheck
git diff --check
```

Expected: all targeted tests and typecheck pass.

```bash
git add src/lib/benchmark/conversation-benchmark-runner.ts src/lib/benchmark/conversation-benchmark-runner.test.ts src/lib/benchmark/conversation-benchmark-cli.ts src/lib/benchmark/conversation-benchmark-cli.test.ts scripts/run-conversation-benchmark.ts
git commit -m "perf(benchmark): judge conversation pairs concurrently"
```

---

### Task 3: Generate, Compare, and Review v2

**Files:**
- Create: `docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-candidate.json`
- Create: `docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-comparison.json`
- Create: `docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-comparison.md`

**Interfaces:**
- Consumes: the original baseline artifact, fixed Luna candidate runner, and concurrent blind judges.
- Produces: reproducible v2 run and comparison artifacts.

- [ ] **Step 1: Generate three v2 replicas**

Run:

```bash
bun run benchmark:conversation candidate --label conversational-strategy-v2 --baseline docs/benchmarks/runs/conversation-2026-08-10-before-conversational-change-baseline.json --samples 3 --allow-db-mutation
```

Expected: 60 complete fixed-Luna turns, no private fields, and a candidate artifact.

- [ ] **Step 2: Run concurrent blind comparison**

Run:

```bash
bun run benchmark:conversation compare --baseline docs/benchmarks/runs/conversation-2026-08-10-before-conversational-change-baseline.json --candidate docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-candidate.json --label conversational-strategy-v2 --judge --concurrency 4
```

Expected: 120 judge verdicts, stable pair order, variant-attributed safety results, JSON and Markdown reports.

- [ ] **Step 3: Review aggregate and scenario evidence**

Calculate structural prevalence, dimensions, verdicts, safety attribution, cost, latency, judge disagreements, and per-scenario verdict/dimension deltas. Manually inspect identity correction, cross-chat transparency, known-thread facts, food discovery, and no-ritual-question evidence before recommending promotion.

- [ ] **Step 4: Commit artifacts**

```bash
git add docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-candidate.json docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-comparison.json docs/benchmarks/runs/conversation-2026-08-10-conversational-strategy-v2-comparison.md
git commit -m "test(benchmark): evaluate conversational strategy v2"
```

- [ ] **Step 5: Run final verification**

Run concurrently:

```bash
bun run lint
bun run typecheck
bun run test
```

Then run:

```bash
git diff --check
git status --short
```

Expected: lint and typecheck exit 0, the full unit suite has no failures, diff check is clean, and the worktree has no uncommitted changes.
