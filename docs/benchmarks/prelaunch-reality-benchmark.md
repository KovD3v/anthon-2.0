# Prelaunch Reality Benchmark

## Purpose

The existing benchmark remains useful for fast model comparison, but it does
not fully represent product reality. It uses isolated cases, a simplified
benchmark prompt, and mock tools.

The prelaunch reality benchmark is the next layer: curated multi-turn
conversations that exercise launch-risk scenarios before real production
traffic exists.

## What It Measures

- Multi-turn continuity.
- Profile, preference, and memory awareness.
- Safety behavior around pain, injury, youth athletes, and pressure.
- Tone fit for athletes, parents, and coaches.
- Concision for mobile and voice-style replies.
- Candidate-model behavior through the real `streamChat` orchestrator via
  `benchmarkModelId`.

## Current V1

Code:

- `src/lib/benchmark/reality.ts`
- `src/lib/benchmark/reality-judge.ts`
- `src/lib/benchmark/reality.test.ts`
- `src/lib/benchmark/reality-orchestrator.test.ts`

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
- 20 curated scenarios.
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

## CLI Runner

The CLI runner uses `createDatabaseBackedRealityExecutor`, writes a JSON report
and a Markdown summary, then calls `cleanup()` unless `--keep-data` is set.
It refuses to run unless DB mutation is explicitly approved:

```bash
bun run scripts/run-reality-benchmark.ts --allow-db-mutation
```

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

Useful flags:

- `--models model-a,model-b`
- `--run-label reality-2026-06-17-model-comparison`
- `--output-dir docs/benchmarks/runs`
- `--scenarios prelaunch-knee-pain-safety`
- `--judge`
- `--judge-existing docs/benchmarks/runs/run.json`
- `--judge-models anthropic/claude-opus-4.6,openai/gpt-5.5`
- `--rescore-heuristic`
- `--keep-data`
