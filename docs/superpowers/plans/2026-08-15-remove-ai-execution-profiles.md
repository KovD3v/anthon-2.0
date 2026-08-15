# Remove AI Execution Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the live `light`/`standard` execution profiles, the fast path, and profile-routing metadata from the chat request path, leaving one standard agentic execution in which the model may select the authorized tools.

**Architecture:** Keep deterministic capability and authorization policy at the application boundary, but remove the separate execution allocator, live profile classifier, compact/light prompt, light-model attempt, escalation, and profile-specific routing telemetry. The normal authenticated path always builds the full prompt and executes one agentic model stream. Historical database JSON may remain readable without being emitted for new turns.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vercel AI SDK, Vitest, Biome, Prisma JSON metadata.

## Global Constraints

- Preserve unrelated work and existing persisted data.
- Do not remove generic user/profile domain concepts; this change concerns AI execution profiles only.
- Keep tool authorization, guest restrictions, deletion-key checks, safety policy, and deterministic capability gates.
- Do not introduce a database migration solely to erase historical routing JSON.
- Verify focused AI tests first, then lint/typecheck/test with known baseline failures reported separately.

## Tasks

- [x] Add failing contract tests proving a turn plan has no execution profile and the live arbitration result has no profile-classification latency.
- [x] Replace execution routing with capability-only deterministic policy; remove fast-path configuration, light prompt, light model selection, profiled fallback, and routing tests/evaluation fixtures.
- [x] Collapse the orchestrator to one full/guest prompt path and one agentic model stream, retaining normal provider, tool, RAG, memory, TTFT, and persistence telemetry.
- [x] Simplify channel flow, persistence, model experiments, and recovery contracts so new turns do not create or require profile routing metadata; retain only safe historical parsing where needed.
- [x] Remove current profile fields from profiler summaries, technical metrics, and admin/chat UI; remove obsolete benchmark/configuration surfaces.
- [x] Rewrite documentation around single agentic execution, run focused and full verification, inspect the diff, and commit the verified change.

## Verification

- `bunx vitest run src/lib/ai/turn-plan.test.ts src/lib/ai/turn-arbitration.test.ts`
- Targeted orchestrator/channel-flow tests covering tool selection, persistence, fallback, and recovery.
- `bun run lint` (report generated-cache baseline if present).
- `bun run typecheck` (report unrelated pre-existing failures separately).
- `bun run test`
- `git diff --check` and clean scoped commit review.
