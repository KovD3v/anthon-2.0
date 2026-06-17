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
- `src/lib/benchmark/reality.test.ts`
- `src/lib/benchmark/reality-orchestrator.test.ts`

Dataset:

- `PRELAUNCH_REALITY_SCENARIOS`
- 6 curated scenarios.
- At least 2 turns per scenario.
- Coverage: onboarding, memory, safety, parent, coach, motivation, voice.

Runner:

- `runRealityBenchmark`
- `evaluateRealityTurn`
- `createStreamChatRealityExecutor`
- `createDatabaseBackedRealityExecutor`

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

## Recommended Next Step

Add an admin or script entrypoint that runs `runRealityBenchmark` with
`createDatabaseBackedRealityExecutor`, exports the result JSON, and calls
`cleanup()` after the report is written.
