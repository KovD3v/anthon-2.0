# Task 6 report: safe capability persistence and delivery attribution

## Status

Task 6 and its focused HIGH-finding fix round are complete in the existing checkout. The user-owned `docs/user-plan-states.md` and `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md` remain untouched and excluded from staging. Tasks 7 and 8 were not started.

## Review fixes

- Voice is no longer inferred from capability selection or a pending web generation job. Cost metrics, telemetry, finish metadata, recovery, and initial assistant persistence explicitly remove pre-delivery `voice` attribution.
- Successful web voice finalization appends `voice` to the closed `data-aiCapabilities` part in the same transaction that attaches the audio, accounts usage, marks the job ready, and updates message media fields. Retry, failure, cancellation, and lost-claim paths do not mutate the capability part.
- Successful Telegram and WhatsApp audio sends atomically update the persisted assistant message's type, media type, and closed capability part. Failed generation or unsent audio leaves the capability part unchanged.
- OpenRouter metadata remains ephemeral input for provider, token, and cost extraction. Extracted metrics retain only safe provider/token/cost scalars; raw provider payload and reasoning content are not returned.
- Telemetry, finish metadata, public parts, `Message`, `MessageMetrics`, and recovery payloads independently strip raw provider metadata and reasoning content. Recovery also sanitizes older payloads containing those fields while preserving billing/quota scalars.

## TDD and verification

RED:

- Focused review suite: 12 failed and 157 passed. Failures reproduced pre-delivery voice attribution, raw metadata/reasoning retention, missing web delivery mutation, missing Telegram/WhatsApp delivery mutation, and unsafe recovery replay.

GREEN:

- Focused suite: 8 files and 169 tests passed.
- Scoped Biome initially reported four formatting/import-order diagnostics; the four files were formatted and are included in the final scoped rerun.
- `bun run typecheck` generated route types successfully, then failed only at the pre-existing unrelated `src/lib/model-experiments/eligibility.test.ts:36` fixture because it lacks `routineProposal` and `voiceOutput`.
- Parent final verification: full unit suite passed with 214 files, 2,101 tests, and 4 skips; scoped Biome passed on 22 Task 6 files; `git diff --check` passed.

The test runner emitted only the existing Vite native-config, `vite-tsconfig-paths`, and typeless `postcss.config.ts` warnings.
