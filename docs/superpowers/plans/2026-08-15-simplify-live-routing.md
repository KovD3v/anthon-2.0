# Simplify Live AI Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route live chat with deterministic fast-path rules and a single kill switch, without a request-time LLM classifier or category rollout configuration.

**Architecture:** Live arbitration always uses deterministic rules and fails closed to the standard profile. A static safety boundary remains in `execution-routing.ts`; `AI_FAST_PATH_ENABLED=false` disables light planning globally. The standard agentic model continues selecting among the tools made available by the existing orchestrator.

**Tech Stack:** TypeScript, Vitest, Next.js 16 App Router, Prisma, Biome, Bun.

## Global Constraints

- Keep `openai/gpt-5.6-luna` unchanged.
- Preserve unrelated worktree changes in the five already modified auth/chat/profile files.
- Do not change the standard agentic tool permissions or prompt behavior.
- Use `bun run` and `bunx` for project commands.
- Keep historical profiler trace parsing compatible where removing fields would break stored traces.

---

### Task 1: Lock down live no-classifier behavior

**Files:**
- Modify: `src/lib/ai/turn-arbitration.test.ts`
- Modify: `src/lib/ai/turn-arbitration.ts`

**Interfaces:**
- `arbitrateTurn(input)` remains the live arbitration entry point.
- The live path produces `classificationLatencyMs: 0` and never invokes a remote classifier.

- [ ] **Step 1: Write the failing test**

Add a test with an ambiguous agentic message and a `measureClassifierCall` spy. Assert the spy is not called, the result has zero classification latency, and the decision is standard.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bunx vitest run src/lib/ai/turn-arbitration.test.ts -t "never invokes the remote classifier"`

Expected: FAIL because the current implementation calls the remote classifier for an ambiguous agentic turn.

- [ ] **Step 3: Implement the minimal change**

Make agentic arbitration call `resolveDeterministicTurnClassification` with `fallbackToStandard: true` unconditionally. Remove the live classifier invocation and its request-time callback/model/context fields from the live arbitration input. Keep the offline classifier module available to its explicit evaluation script.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `bunx vitest run src/lib/ai/turn-arbitration.test.ts -t "never invokes the remote classifier"`

Expected: PASS with no classifier call.

- [ ] **Step 5: Update the remaining arbitration tests**

Replace assertions that expect live classifier proposals, latency, attribution, uncertainty, failure, or cancellation with deterministic standard fallback assertions. Keep tests for social and self-contained deterministic light routing.

- [ ] **Step 6: Run the complete arbitration test file**

Run: `bunx vitest run src/lib/ai/turn-arbitration.test.ts`

Expected: PASS.

### Task 2: Replace rollout routing with a single fast-path switch

**Files:**
- Create: `src/lib/ai/fast-path-config.ts`
- Create: `src/lib/ai/fast-path-config.test.ts`
- Modify: `src/lib/ai/execution-routing.ts`
- Modify: `src/lib/ai/execution-routing.test.ts`
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/turn-plan.test.ts`

**Interfaces:**
- `isFastPathEnabled(env?: Record<string, string | undefined>): boolean` reads `AI_FAST_PATH_ENABLED`.
- `buildPlannedExecution({ decision, fastPathEnabled })` selects light only when the deterministic decision is eligible and the switch is enabled.

- [ ] **Step 1: Write the failing config tests**

Assert that the switch is enabled when unset or `true`, disabled for the exact value `false`, and disabled for invalid non-empty values.

- [ ] **Step 2: Run the config tests and verify they fail**

Run: `bunx vitest run src/lib/ai/fast-path-config.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the switch**

Create the parser with the behavior specified above and export `isFastPathEnabled`.

- [ ] **Step 4: Run the config tests and verify they pass**

Run: `bunx vitest run src/lib/ai/fast-path-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing execution-routing assertions**

Replace rollout tests with assertions that enabled deterministic light work plans light, disabled fast path plans standard with `fast_path_disabled`, and non-light work remains standard regardless of the switch. Remove tests for mode, percentage, stable allocation, and task allowlists.

- [ ] **Step 6: Implement direct planning**

Remove environment rollout parsing, hash allocation, and configurable task checks from `execution-routing.ts`. Keep static safety checks and the standard fallback bundle. Update `orchestrator.ts` and turn-plan fixtures to pass only `fastPathEnabled`.

- [ ] **Step 7: Run focused routing tests**

Run: `bunx vitest run src/lib/ai/fast-path-config.test.ts src/lib/ai/execution-routing.test.ts src/lib/ai/turn-plan.test.ts`

Expected: PASS.

### Task 3: Remove the admin/database routing control plane

**Files:**
- Delete: `src/app/(admin)/admin/classifier/page.tsx`
- Delete: `src/app/api/admin/classifier/route.ts`
- Delete: `src/app/api/admin/classifier/route.test.ts`
- Delete: `src/lib/ai/ai-routing-config.ts`
- Delete: `src/lib/ai/ai-routing-config.test.ts`
- Delete: `src/lib/ai/ai-routing-config-store.ts`
- Delete: `src/lib/ai/ai-routing-config-store.test.ts`
- Modify: `src/app/(admin)/admin/layout-client.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260815130000_remove_ai_routing_config/migration.sql`

**Interfaces:**
- No admin route or database model controls live routing.
- Runtime control is the `AI_FAST_PATH_ENABLED` environment variable.

- [ ] **Step 1: Remove admin navigation and route files**

Delete the classifier navigation item, page, API handler, and their tests. Remove the now-unused classifier card from the admin overview.

- [ ] **Step 2: Remove Prisma model and relation**

Remove `AiRoutingConfig` and the `User.aiRoutingConfigUpdates` relation from the schema. Add a migration that drops the table and its index/foreign key by dropping the table.

- [ ] **Step 3: Validate the schema and generated client**

Run: `bunx prisma validate && bunx prisma generate`

Expected: PASS with no `AiRoutingConfig` references in the generated schema contract.

### Task 4: Remove live classifier fields from active orchestration and docs

**Files:**
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/execution-route-trace.ts`
- Modify: `src/types/chat.ts`
- Modify: profiler summary/timeline files only where they expose live classifier work
- Modify: `.env.example`
- Modify: `docs/ai-system.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Live route traces identify the deterministic decision and executed profile without live classifier attribution.
- `AI_FAST_PATH_ENABLED` is documented as the only fast-path switch.

- [ ] **Step 1: Add regression assertions**

Assert that deterministic live routing does not create or present a classifier phase and that active route traces do not contain classifier model/provider fields.

- [ ] **Step 2: Remove active-path propagation**

Stop copying classifier attribution and non-zero classification latency from live arbitration into prepared turns and route traces. Preserve parser compatibility for old persisted traces if the existing schema requires it.

- [ ] **Step 3: Update documentation and environment examples**

Replace rollout and admin instructions with the fast-path switch and the standard-agentic fallback behavior.

- [ ] **Step 4: Run focused profiler/orchestrator tests**

Run: `bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/trace.test.ts src/lib/response-profiler/summary.test.ts`

Expected: PASS.

### Task 5: Full verification and commit

**Files:**
- Modify only files covered by Tasks 1–4.

- [ ] **Step 1: Run scoped Biome checks**

Run: `bunx biome check src/lib/ai src/types/chat.ts 'src/app/(admin)' src/app/api/admin .env.example`

Expected: PASS or only the known unrelated global cache issue remains outside the scoped files.

- [ ] **Step 2: Run the full unit suite**

Run: `bun run test`

Expected: all relevant tests pass.

- [ ] **Step 3: Run typecheck and build**

Run: `bun run typecheck && bun run build`

Expected: PASS.

- [ ] **Step 4: Verify the running Next.js app**

With `bun run dev` running, check `/_next/mcp` compilation/errors and verify that `/admin` no longer links to `/admin/classifier`. Verify the health endpoint remains 200.

- [ ] **Step 5: Review the diff and commit**

Run: `git diff --check`, `git status --short`, and `git diff --stat`. Stage only the files from this plan and commit with `refactor(ai): simplify live routing`.
