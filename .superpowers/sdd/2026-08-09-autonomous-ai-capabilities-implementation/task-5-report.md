# Task 5 report: autonomous routine proposals with deterministic voice guards

## Status

Implemented in the existing checkout. The user-owned documentation changes remain untouched and excluded from staging. Task 6 UI and capability-telemetry persistence were not started.

## Changed files

- `src/lib/ai/orchestrator.ts`
  - Agentic routine inventory now requires the normalized decision and an explicit `routineProposal: true` capability-planner selection; legacy deterministic routine intent remains unchanged.
  - Replaced mandatory routine wording with optional, proposal-only guidance and retained the deterministic global step ceiling.
  - Preserves only the first accepted routine tool result for the dedicated routine-card payload, so rejected parallel calls cannot replace it.
- `src/lib/ai/orchestrator.test.ts`
  - Covers selected/unselected agentic inventory, no forced first-step call, proposal-only prompt policy, accepted-card extraction under parallel calls, routine plus RAG/web composition, and guarded voice capability metadata.
- `src/lib/ai/tools/routine-proposal.ts`
  - Makes proposal-only, at-most-once, and no Routine/RoutineAttempt mutation semantics explicit in the model-facing description.
- `src/lib/ai/tools/routine-proposal.test.ts`
  - Retains the parallel execution guard regression and expands no-write coverage across Routine and RoutineAttempt create/update/delete operations.

## TDD evidence

RED:

- `bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/tools/routine-proposal.test.ts`
  - Exit 1: 4 failed and 73 passed. Failures reproduced agentic regex leakage, mandatory prompt wording, rejected parallel input replacing the accepted card, and incomplete proposal-only tool description.

GREEN:

- `bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/tools/routine-proposal.test.ts`
  - Exit 0: 2 files and 77 tests passed.
- Required focused suite plus routine contracts:
  - `bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/voice/decision.test.ts src/lib/voice/preflight.test.ts src/lib/ai/tools/routine-proposal.test.ts src/lib/ai/routine-model-contract.test.ts`
  - Exit 0: 5 files and 114 tests passed.
- Full unit suite (`bun run test`): exit 0; 214 files passed, 1 skipped; 2,089 tests passed, 4 skipped.
- Scoped Biome over the four changed TypeScript files: passed.
- Scoped TypeScript with `/private/tmp/anthon-task5-tsconfig.json`: passed.
- `git diff --check`: passed.

The focused test runner emitted only the existing Vite native-config, `vite-tsconfig-paths`, and typeless `postcss.config.ts` warnings.

## Guardrail review

- Agentic mode does not force `proposeRoutine`; the response model may choose it only from planner-authorized inventory.
- Legacy mode retains deterministic routine intent and its existing forced structured call path.
- The existing five-step agentic ceiling remains unchanged. The routine tool's synchronous factory-local guard rejects concurrent duplicate calls, and card extraction ignores rejected results.
- Routine proposals remain non-persistent and do not save, run, archive, or mutate Routine or RoutineAttempt records.
- RAG, web search/fetch, memory, and routine inventory remain composable from one immutable turn plan.
- Voice remains outside the model tool inventory. Existing decision/preflight tests continue to cover disabled preference, ineligible plan, unavailable capacity, quota, cadence, and explicit-text vetoes; capability metadata records voice only when the already-authorized response mode and eligibility allow it.
