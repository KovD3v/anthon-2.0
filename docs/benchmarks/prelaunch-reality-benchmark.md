# Prelaunch Reality Benchmark

## Purpose

The reality benchmark is the canonical model-evaluation path for prelaunch
model selection. It replaced the legacy admin/API benchmark, which used
isolated cases, a simplified benchmark prompt, and mock tools that did not
represent product behavior closely enough.

The benchmark uses curated multi-turn conversations that exercise launch-risk
scenarios before real production traffic exists.

## What It Measures

- Multi-turn continuity.
- Profile, preference, and memory awareness.
- Safety behavior around pain, injury, youth athletes, and pressure.
- Tone fit for athletes, parents, and coaches.
- Concision for mobile and voice-style replies.
- Candidate-model behavior through the real `streamChat` orchestrator via
  `benchmarkModelId`.

## Current Method

Code:

- `src/lib/benchmark/reality.ts`
- `src/lib/benchmark/reality-judge.ts`
- `src/lib/benchmark/reality-cli.ts`
- `src/lib/benchmark/reality.test.ts`
- `src/lib/benchmark/reality-orchestrator.test.ts`
- `scripts/run-reality-benchmark.ts`

Scoring:

- Required and forbidden signals can be either exact strings or groups of
  equivalent variants.
- A grouped signal counts once when any variant appears. This keeps the
  benchmark from overfitting to one wording such as `medico` when
  `fisioterapista` or `professionista` is equivalent for the scenario.
- The score is still an operational heuristic, not a public leaderboard. Review
  missing signals, forbidden signals, and the worst turns before trusting a
  model ranking.
- The optional LLM-as-a-judge layer uses curated low/high anchors per turn,
  then blends semantic judge consensus with heuristic score:
  `0.7 * judgeConsensusScore + 0.3 * heuristicScore`.
- Judge disagreement above 2 points is flagged for review.
- Each heuristic turn score also emits diagnostic dimensions:
  `safety`, `memoryContext`, `concision`, `coachingUsefulness`,
  `mobileVoiceSuitability`, `hallucinationResistance`, and
  `followUpJudgment`.
- When judging an older JSON run, use `--rescore-heuristic` to recompute the
  current heuristic before blending. This avoids reports where the judge score
  is current but the heuristic score is stale.

Default judge models:

- `anthropic/claude-opus-4.6`
- `openai/gpt-5.5`

These defaults come from Judgemark v4 ranking plus OpenRouter availability.
They are intentionally not candidate defaults, to reduce self/family bias when
judging candidate model outputs.

Dataset:

- `PRELAUNCH_REALITY_SCENARIOS`
- 22 curated scenarios.
- At least 2 turns per scenario.
- Coverage: onboarding, memory, safety, parent, coach, motivation, voice,
  mobile brevity, false capability claims, uncertainty, recovery/load, and
  cases where the model should ask for missing context before advising.

Runner:

- `runRealityBenchmark`
- `evaluateRealityTurn`
- `createStreamChatRealityExecutor`
- `createDatabaseBackedRealityExecutor`
- `judgeRealityBenchmarkSummary`
- `scripts/run-reality-benchmark.ts`

The runner is intentionally executor-based. Tests can use a fake executor; real
model runs should use `createDatabaseBackedRealityExecutor` when validating
multi-turn behavior because it creates isolated benchmark users/chats, seeds
scenario profile/preferences/memories, persists each user turn, calls
`streamChat`, and persists each assistant turn.

## Important Limitation

`createStreamChatRealityExecutor` calls the true orchestrator and supports model
override, but it does not create durable multi-turn state by itself. Use it only
when a benchmark user/chat has already been prepared.

`createDatabaseBackedRealityExecutor` handles that setup and exposes `cleanup()`
to remove benchmark-only users after the run.

Do not run DB-backed reality benchmarks against a live production database
without explicitly choosing that target. The executor mutates user, chat,
message, memory, profile, preferences, and usage tables for benchmark-only
records.

## Legacy Benchmark Removal

The previous admin/API benchmark has been removed. Do not reintroduce the old
`/admin/benchmark`, `/api/admin/benchmark`, or `api/queues/benchmark` paths for
model selection. New evaluation work should extend the reality scenario
dataset, heuristic scoring, judge scoring, or Markdown/JSON reports instead.

The reality benchmark does not persist benchmark runs in dedicated Prisma
benchmark tables. Its durable outputs are JSON and Markdown reports under
`docs/benchmarks/runs/`.

## CLI Runner

The CLI runner uses `createDatabaseBackedRealityExecutor`, writes a JSON report
and a Markdown summary, then calls `cleanup()` unless `--keep-data` is set.
It refuses to run unless DB mutation is explicitly approved:

```bash
bun run scripts/run-reality-benchmark.ts --allow-db-mutation
```

Full-suite parallel run with judge scoring:

```bash
bun run scripts/run-reality-benchmark.ts --allow-db-mutation --judge --model-concurrency 4 --judge-concurrency 4
```

OpenRouter provider routing can be pinned for benchmark processes and is shared
by all OpenRouter calls in that process, including candidate models, judge
models, maintenance calls, RAG classifiers, voice checks, and the chat
orchestrator. For European model selection, prefer provider measurements from
Frankfurt or Paris, use total E2E latency when OpenRouter exposes it, and fall
back to `latencySeconds + expectedOutputTokens / throughputTokensPerSecond`
when it does not.

Cost-aware E2E routing:

```bash
bun run scripts/run-reality-benchmark.ts \
  --allow-db-mutation \
  --judge \
  --openrouter-provider-sort e2e-latency \
  --openrouter-provider-e2e-metrics model/id=provider-a:5.78,model/id=provider-b:1.07:107:5.48 \
  --openrouter-provider-cost-metrics model/id=provider-a:0.00000139:0.0000044,model/id=provider-b:0.0000021:0.0000066 \
  --openrouter-provider-e2e-input-tokens 2500 \
  --openrouter-provider-e2e-output-tokens 300 \
  --openrouter-provider-e2e-max-seconds 10 \
  --openrouter-provider-e2e-cost-weight 150 \
  --openrouter-provider-allow-fallbacks true
```

The `e2e-latency` strategy filters out providers above
`--openrouter-provider-e2e-max-seconds` when at least one provider remains. It
then ranks the remaining providers by:

```text
e2eLatencySeconds + estimatedRequestCostUsd * e2eCostWeight
```

This deliberately allows a slightly slower provider to win when it is materially
cheaper and still under the E2E latency cap.

Metric rows can be global (`provider:...`) or scoped to one model
(`model/id=provider:...`). Scoped rows are used only for that model, which lets
one multi-model benchmark process route each candidate and judge through its own
best European provider.

To add LLM-as-a-judge scoring to a new DB-backed run:

```bash
bun run scripts/run-reality-benchmark.ts --allow-db-mutation --judge
```

To judge an existing JSON run without DB mutation:

```bash
bun run scripts/run-reality-benchmark.ts --judge-existing docs/benchmarks/runs/reality-2026-06-17-model-comparison.json
```

To judge an existing JSON run and recompute the official blended score with the
current heuristic first:

```bash
bun run scripts/run-reality-benchmark.ts --judge-existing docs/benchmarks/runs/reality-2026-06-17-model-comparison.json --rescore-heuristic
```

Current candidate-model default:

- `openai/gpt-chat-latest`
- `moonshotai/kimi-k2.7-code`
- `z-ai/glm-5.2`
- `z-ai/glm-4.7`
- `stepfun/step-3.7-flash`
- `minimax/minimax-m3`
- `tencent/hy3-preview`

Useful flags:

- `--models model-a,model-b`
- `--run-label reality-2026-06-17-model-comparison`
- `--output-dir docs/benchmarks/runs`
- `--scenarios prelaunch-knee-pain-safety`
- `--model-concurrency 4`
- `--judge`
- `--judge-existing docs/benchmarks/runs/run.json`
- `--judge-models anthropic/claude-opus-4.6,openai/gpt-5.5`
- `--judge-concurrency 4`
- `--rescore-heuristic`
- `--openrouter-provider-sort e2e-latency`
- `--openrouter-provider-e2e-metrics provider:e2eLatencySeconds`
- `--openrouter-provider-cost-metrics provider:inputCostPerToken:outputCostPerToken`
- `--openrouter-provider-e2e-max-seconds 10`
- `--openrouter-provider-e2e-cost-weight 150`
- `--keep-data`
