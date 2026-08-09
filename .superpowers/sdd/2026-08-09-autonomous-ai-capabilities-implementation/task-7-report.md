# Task 7 report: immutable decisions across prepared turns and channels

## Status

Task 7 is complete in the existing `feat/chat-coaching-loop` checkout. The inherited partial diff was reconciled in place. `docs/user-plan-states.md` and `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md` remain excluded from Task 7 staging.

## Implementation

- `normalizeCapabilityDecision` now returns a frozen final decision, including attributable pending-approval and agentic routine-selection policy. The orchestrator no longer patches a normalized result afterward.
- Normal and prepared turns capture one planner mode and one decision. Prepared comparisons retain the same object while exposing no executable tools; normal turns reuse it for inventory, step policy, metrics, finish callbacks, channel persistence, and the web voice persistence handoff.
- Shared channel flow remains the policy boundary for Web, Telegram, and WhatsApp approval attribution and exact deletion targets. Guest turns retain allowed web inventory while normalized memory read/write/delete and user context remain denied.
- Persistence no longer rereads `AI_CAPABILITY_PLANNER_MODE`. Agentic turns skip the legacy extractor using the captured mode, while unspecified direct persistence keeps the legacy default. Agentic web turns continue to bypass legacy direct TinyFish prefetch.
- Capability usage remains a Task 6 closed aggregate and is filtered against the captured agentic decision before metrics/persistence. The model-experiment `TurnPlan` fixture now includes Task 6 capability fields and `memoryDeleteTarget`.

## TDD evidence

RED:

- Arbitration/persistence regressions: 3 failed and 33 passed. Failures reproduced post-normalization routine leakage, missing pending-approval normalization, and persistence rereading process planner mode.
- Shared-flow/web-voice regressions: 2 failed and 80 passed. Failures reproduced the decision being dropped from `RunChannelFlowResult` and legacy extraction running during agentic voice persistence.

GREEN:

- Required Task 7 focused suite: 5 files and 237 tests passed.
- Complete AI/channel suite: 36 files passed, 1 skipped; 527 tests passed, 4 skipped.
- Additional arbitration, persistence, guest-route, and model-experiment suite: 5 files and 83 tests passed.
- Full unit suite: 214 files passed, 1 skipped; 2,110 tests passed, 4 skipped.
- `bun run typecheck`: Next route generation and `tsc --noEmit` passed.
- Scoped Biome: 17 Task 7 TypeScript files passed.
- `git diff --check`: passed.

The test runner emitted only the existing Vite native-config, `vite-tsconfig-paths`, and typeless `postcss.config.ts` warnings. No live external integration or browser verification was required for this server-side orchestration task.
