# Plan 021: Design a guarded experiment-to-routing promotion workflow

> **Executor instructions**: Follow this plan step by step. This is a **design-only spike**: do not implement APIs, schema, UI, routing mutations, jobs, or feature flags. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/lib/model-experiments src/lib/plans/catalog.ts src/lib/plans/policy-engine.ts prisma/schema.prisma 'src/app/(admin)/admin/model-experiments' docs/model-experiment-routing-promotion-design.md`
> If any referenced implementation changed since this plan was written, reconcile the design against live code before proceeding; if the ownership or safety assumptions materially changed, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (design only); eventual implementation is HIGH risk
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

Anthon already runs paired model experiments and reports Italy-targeted preference, latency, cost, throughput, reliability, feedback, and a manual-review readiness gate. Production routing remains static in `PLAN_CATALOG`, so promoting a winner is a manual source edit with no common approval record, tier-scoped rollout contract, or first-class rollback design. This spike must define a safe, auditable workflow before anyone builds it; it must explicitly reject automatic production mutation based solely on experiment results.

## Current state

- `src/lib/model-experiments/results.ts:133-181` returns votes, Wilson interval, failure rates, control/candidate latency, cost, output tokens/second, feedback, and `readyForManualReview` (`>=100` completed pairs, `>=30` participants, `>=7` days).
- `src/lib/model-experiments/service.ts:46-84` creates an immutable audit event for experiment creation; `:167-217` audits lifecycle transitions.
- `prisma/schema.prisma:470-476` defines experiment lifecycle states through `COMPLETED`; there is no promotion state.
- `prisma/schema.prisma:668-681` stores actor, action, before/after JSON, and timestamp in `ModelExperimentAudit`.
- `src/lib/plans/catalog.ts:18-22` defines static maintenance/orchestrator/fallback model constants; each canonical plan then embeds role routing. `MODEL_TIER_TO_CANONICAL_PLAN` maps entitlement tiers to runtime plans.
- `src/lib/plans/policy-engine.ts:6-13` derives runtime model routing from the effective model tier and static catalog.
- `src/app/(admin)/admin/model-experiments/page.tsx` already displays summaries and recent audit events; it is the likely operator surface, not authorization to implement it in this spike.
- Product ordering for model choice is Italy latency first, then cost, then role-specific capability, then tokens/second. Reliability/safety are fail-closed gates, not lower-priority tradeable scores.

Current metrics excerpt (`results.ts:178-181`):

```ts
readyForManualReview:
  completedPairs.length >= 100 &&
  new Set(completedPairs.map((pair) => pair.userId)).size >= 30 &&
  daysRunning >= 7,
```

Current routing excerpt (`catalog.ts:18-22`):

```ts
const MAINTENANCE_MODEL_ID = "google/gemini-2.5-flash-lite";
const ORCHESTRATOR_MODEL_ID = "z-ai/glm-5.2";
const ORCHESTRATOR_FALLBACK_MODEL_IDS = ["deepseek/deepseek-v4-flash"];
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Inspect references | `rg -n 'readyForManualReview|ModelExperimentAudit|modelRouting|MODEL_TIER_TO_CANONICAL_PLAN' src prisma/schema.prisma` | cited ownership points found |
| Validate required design terms | `rg -n 'approval|tier|audit|rollback|fail.closed|automatic production|non-goal' docs/model-experiment-routing-promotion-design.md` | every safety topic appears |
| Document hygiene | `git diff --check -- docs/model-experiment-routing-promotion-design.md` | no output, exit 0 |

## Scope

**In scope** (the only product artifact to create):

- `docs/model-experiment-routing-promotion-design.md`

**Read-only references**:

- `src/lib/model-experiments/results.ts`, `service.ts`, `types.ts`, and `lifecycle.ts`
- `src/lib/plans/catalog.ts` and `policy-engine.ts`
- `prisma/schema.prisma`
- `src/app/(admin)/admin/model-experiments/page.tsx`
- relevant model-selection benchmark docs

**Out of scope**:

- Any source, schema, migration, API, UI, environment, feature-flag, or deployment change.
- Automatic promotion or automatic production routing mutation.
- Choosing/promoting a specific model.
- Redesigning experiment sampling, judging, or paired-comparison UX.
- Broadening live integration access.

## Git workflow

- Branch: `advisor/021-model-promotion-design`.
- Conventional commit: `docs(ai): design guarded model promotion`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Document actors, vocabulary, and invariants

Create `docs/model-experiment-routing-promotion-design.md`. Define experiment, candidate, control, promotion proposal, target role, canonical plan/tier scope, approval, rollout, rollback, and terminal outcome. State invariants prominently:

- results may create a proposal, never mutate production routing;
- an authenticated authorized admin must explicitly approve;
- approval is bound to immutable experiment/result snapshot, candidate model/config, role, exact tiers, and rollout policy;
- missing/stale/ambiguous data fails closed;
- every proposal, approval, activation, pause, rollback, rejection, and failure is audited with actor and before/after state.

**Verify**: `rg -n '## (Vocabulary|Actors|Safety invariants)' docs/model-experiment-routing-promotion-design.md` → all three sections exist and explicitly say no automatic production mutation.

### Step 2: Specify the state machine and authorization contract

Define a state machine such as `DRAFT -> REVIEWABLE -> APPROVED -> ROLLING_OUT -> ACTIVE`, with `REJECTED`, `PAUSED`, `ROLLED_BACK`, and `FAILED` exits. For every transition, provide actor, prerequisites, persisted audit event, idempotency behavior, and invalid-transition response. Require fresh admin authorization at approval and activation; identify which existing admin authorization pattern an implementation should reuse after verifying it in the repo. Make approval revocable before activation and immutable afterward.

**Verify**: `rg -n 'DRAFT|REVIEWABLE|APPROVED|ROLLING_OUT|ACTIVE|REJECTED|PAUSED|ROLLED_BACK|FAILED|idempot' docs/model-experiment-routing-promotion-design.md` → every state and idempotency are specified.

### Step 3: Define evidence gates and tier-scoped rollout

Specify an evidence checklist using existing summary data: manual-review readiness, Italy-target match, minimum samples/users/duration, preference interval, p50/p95 first-token and total latency, cost, failure/partial-failure rates, canonical feedback, and throughput. Preserve the decision ordering: reliability/safety must pass; then Italy latency, cost, role-specific capability, and tokens/second inform the human decision. Do not invent universal numeric promotion thresholds beyond current readiness constants; mark thresholds that require product input as explicit open decisions.

Define exact target dimensions: model role (`orchestrator`, `subAgent`, or `maintenance`), canonical plans/tier set, percentage/cohort, start/end, and fallback chain. Require a smallest eligible tier/cohort canary before expansion; no proposal may silently apply to all tiers.

**Verify**: `rg -n 'Italy|p50|p95|cost|failure|feedback|tokens|orchestrator|subAgent|maintenance|canary' docs/model-experiment-routing-promotion-design.md` → evidence and tier/role rollout dimensions are present.

### Step 4: Specify fail-closed runtime and rollback behavior

Describe the future routing overlay at an architectural level: static `PLAN_CATALOG` remains the known-good baseline; only an active, valid, tier-and-role-matching promotion may override it. Invalid configuration, expired rollout, missing model, unavailable store, audit-write failure, or evaluation exception must return baseline routing and emit a structured diagnostic. Specify automated health triggers that may pause/rollback to baseline, but not promote/expand, plus a manual emergency rollback. State whether in-flight chats stay pinned or switch only on the next turn and call out that choice as an open decision if evidence is insufficient.

Include rollback RTO/verification, idempotency, audit event, cache invalidation, and recovery when the promotion store is unavailable.

**Verify**: `rg -n 'baseline|fail.closed|rollback|RTO|cache|in.flight|unavailable' docs/model-experiment-routing-promotion-design.md` → all failure and recovery dimensions are specified.

### Step 5: Provide an implementation decomposition without implementing

Add a proposed data model, service/API boundaries, admin UX sequence, observability, security/threat analysis, test matrix, staged delivery, migration/backfill needs, and open decisions. Use clearly labeled **proposed** names and map each future change to likely files. Split implementation into independently reviewable phases: persistence/state machine; read-only proposal UI; approval; runtime overlay behind disabled flag; canary; rollback drill. Each phase must have verification and a kill switch.

End with explicit non-goals, especially: no automatic production mutation, no implementation in this spike, no model selection, and no removal of static fallback routing.

**Verify**: `rg -n '## (Proposed data model|Service and API boundaries|Admin UX|Observability|Security|Test matrix|Staged delivery|Open decisions|Non-goals)' docs/model-experiment-routing-promotion-design.md` → every section exists.

### Step 6: Validate the document and scope

Run docs checks and inspect the diff.

**Verify**: `git diff --check -- docs/model-experiment-routing-promotion-design.md && git status --short` → exit 0; only the new design document and executor-owned `plans/README.md` status row are modified. Biome currently ignores Markdown, so do not use a zero-file Biome run as a validation gate.

## Test plan

This spike adds no executable product code. The design's test matrix must nevertheless specify future unit tests for transition authorization/idempotency/evidence gates, integration tests for transactional audit persistence and fail-closed reads, route tests for admin authorization and stale approvals, and end-to-end tests for canary/rollback. It must include fault injection for unavailable storage, invalid overlays, failed audit writes, cache staleness, and concurrent approval/rollback.

## Done criteria

- [ ] Exactly one product artifact, `docs/model-experiment-routing-promotion-design.md`, is created.
- [ ] The design covers explicit approval, exact tier/role scoping, immutable audit, canary rollout, rollback, and fail-closed baseline behavior.
- [ ] It explicitly prohibits automatic production mutation and leaves production code untouched.
- [ ] It preserves Italy latency first, then cost, role capability, and tokens/second, behind reliability/safety gates.
- [ ] It contains a state machine, proposed ownership map, phased implementation, threat analysis, test matrix, observability, and open decisions.
- [ ] Required-section searches and `git diff --check` exit 0; scope is clean.

## STOP conditions

- The static catalog is no longer the production routing source of truth or a promotion mechanism already exists.
- The executor cannot identify an existing admin authorization pattern; record the missing evidence rather than inventing authorization.
- Product input is required for a numeric threshold, tier eligibility, or in-flight behavior; list it as an open decision rather than choosing silently.
- Any step appears to require changing code, schema, flags, or deployed state.
- The document would expose secret values or sensitive operational credentials.

## Maintenance notes

This document is an architecture decision input, not implementation authorization. Before build work begins, product and operations owners should resolve the open thresholds, eligible tiers, in-flight pinning, and rollback RTO. Reviewers should scrutinize any later implementation that can bypass explicit approval, widen tier scope, continue on missing state, or expand automatically; those violate the core safety contract.
