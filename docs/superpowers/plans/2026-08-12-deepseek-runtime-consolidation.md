# DeepSeek Runtime Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decide the chat-metadata model from a reproducible comparison and consolidate Luna's fallback onto the already-used exact DeepSeek V4 Flash 0731 model without weakening provider routing or model attribution.

**Architecture:** Keep the two production execution profiles: Luna remains the standard orchestrator and DeepSeek 0731 remains the light model. A metadata-specific routing helper gives every benchmark candidate schema-compatible, no-reasoning options. The benchmark compares the old DeepSeek metadata model, DeepSeek 0731, and Nemotron on identical curated Italian inputs. Luna keeps OpenRouter's native fallback, while streamed step metadata records the model that actually executed instead of attributing fallback traffic to Luna.

**Tech Stack:** TypeScript, AI SDK 7, OpenRouter, Vitest, Bun, Biome.

## Constraints

- Preserve Gemini's existing specialized roles.
- Do not replace Luna as the primary standard orchestrator.
- Use exact model IDs; do not silently substitute aliases.
- Use curated, non-sensitive benchmark fixtures only.
- Structured-output validity is a hard gate for chat metadata.
- Keep all unrelated worktree changes unstaged and outside the final commit.

### Task 1: Make the metadata comparison represent production routing

**Files:**
- Modify: `scripts/evaluate-chat-metadata-models.test.ts`
- Modify: `scripts/evaluate-chat-metadata-models.ts`
- Create: `src/lib/ai/chat-metadata-model.ts`
- Create: `src/lib/ai/chat-metadata-model.test.ts`
- Modify: `src/lib/ai/chat-title.ts`
- Modify: `src/lib/ai/chat-title.test.ts`

- [x] Write tests that pin the three consolidation candidates and verify schema-compatible metadata routing for DeepSeek 0423, DeepSeek 0731, and Nemotron.
- [x] Run the focused tests and observe the expected failures.
- [x] Implement the shared metadata candidate/model routing contract and reuse it in production plus the benchmark runner.
- [x] Run focused tests to green.

### Task 2: Run and record the metadata benchmark

**Files:**
- Create: `docs/benchmarks/chat-metadata-model-consolidation-2026-08-12.json`
- Create: `docs/benchmarks/chat-metadata-model-consolidation-2026-08-12-review.json`
- Create: `docs/benchmarks/chat-metadata-model-consolidation-2026-08-12.md`
- Modify conditionally: `src/lib/ai/chat-metadata-model.ts`

- [x] Run two passes over the 12 curated Italian scenarios for all three exact candidates.
- [x] Inspect validity, title/icon quality, Italy latency, provider used, and cost.
- [x] Select 0731 or Nemotron only if it clears structured-output reliability and quality gates; otherwise retain the old metadata model.
- [x] Record the decision and rerun metadata tests.

### Task 3: Make DeepSeek 0731 the truthful Luna fallback

**Files:**
- Modify: `src/lib/plans/catalog.test.ts`
- Modify: `src/lib/plans/catalog.ts`
- Modify: `src/lib/ai/providers/openrouter.test.ts`
- Modify as required: orchestrator execution tests and implementation

- [x] Add failing behavioral tests for the exact 0731 fallback and actual executed-model attribution.
- [x] Replace the old DeepSeek fallback ID with exact 0731 while preserving user-owned edits in `catalog.ts`.
- [x] Attribute streamed fallback steps to the model reported by OpenRouter.
- [x] Run provider, plan, and orchestrator tests to green.

### Task 4: Verify and commit the scoped result

- [x] Run Biome on touched files.
- [x] Run focused tests, the full test suite, and typecheck; record unrelated global-lint blockers without modifying user-owned files.
- [ ] Inspect the diff and stage only this task's hunks, especially the shared dirty `catalog.ts`.
- [ ] Commit with a conventional commit message; do not push or deploy.
