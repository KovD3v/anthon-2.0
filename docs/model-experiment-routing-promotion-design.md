# Guarded Model Experiment Routing Promotion Design

## Status and scope

This document proposes a guarded path from completed paired-model experiment evidence to a narrowly scoped production-routing overlay. It is a design only. It does not authorize an implementation, define product thresholds, or change the static routing in `src/lib/plans/catalog.ts` and `src/lib/plans/policy-engine.ts`.

The existing experiment system remains an evidence generator. A promotion proposal is a new, separately controlled object. Creating, reviewing, approving, rejecting, pausing, rolling back, or failing a proposal never edits an experiment, the plan catalog, environment configuration, or provider configuration.

### Non-goals

- Automatically promoting the experiment winner.
- Automatically mutating source code, schema, configuration, feature flags, or all production tiers.
- Treating `readyForManualReview` as a promotion decision or safety guarantee.
- Replacing the static plan catalog as the production baseline.
- Selecting numeric reliability, safety, latency, cost, traffic, cohort, duration, RTO, or evidence-freshness thresholds in this design.
- Defining which exact tiers or roles should receive a particular candidate.
- Reworking experiment generation, voting, experiment lifecycle, or model-provider selection.
- Supporting general-purpose dynamic routing outside an explicitly approved promotion.

## Vocabulary

- **Experiment**: the existing paired comparison and its variants, responses, votes, operational measurements, feedback, and lifecycle audits.
- **Evidence snapshot**: an immutable, content-addressed capture of the experiment identity, variant configuration, result aggregates, evidence window, data completeness, and source versions used for a decision.
- **Proposal**: an advisory request to apply one candidate to one exact routing role and scope. A proposal never mutates production routing.
- **Approval**: an explicit, freshly authenticated admin decision bound to one immutable evidence snapshot and one immutable proposed configuration.
- **Activation**: a separate, freshly authenticated admin action that makes an approved proposal eligible for routing.
- **Routing overlay**: the optional production lookup result applied only when an `ACTIVE` proposal exactly matches the request. The static catalog remains the fallback and source baseline.
- **Scope**: the exact role, exact tiers, cohort rule, percentage, time window, and fallback behavior approved for rollout.
- **Canary**: the smallest explicitly selected rollout scope. “Smallest” is a product decision; this design does not assign a percentage or infer tiers.
- **Expansion**: any increase or change in tiers, cohort, percentage, duration, role, candidate, fallback, or other routing behavior. Expansion requires a new immutable configuration and approval; it is never implicit.
- **Pause**: temporarily disable overlay eligibility while retaining the approved record and recovery path.
- **Rollback**: terminate overlay eligibility and restore baseline routing for new routing decisions.
- **Baseline**: routing resolved exclusively from the static plan catalog and policy engine.

## Actors and ownership

| Actor | Responsibilities | Explicit limits |
| --- | --- | --- |
| Experiment analyst | Reviews evidence, records caveats, drafts proposals | Cannot approve, activate, expand, or mutate production routing |
| Authorized admin | Reviews and rejects proposals; may approve after fresh authentication | Approval alone does not activate routing |
| Authorized activating admin | Activates, pauses, resumes where allowed, or manually rolls back after fresh authentication | Cannot alter the approved immutable configuration during activation |
| Routing resolver | Reads a valid active overlay and otherwise returns baseline | Cannot create, approve, expand, or repair proposals |
| Safety monitor | Evaluates approved guard conditions and may pause or roll back | Cannot promote, activate, resume, or expand |
| Emergency operator | Invokes the documented manual rollback and verifies baseline recovery | Cannot silently rewrite approval evidence or rollout scope |
| Auditor | Reads state, transitions, evidence, and diagnostics | Read-only |

The minimum authorization role and whether approval and activation require two distinct people are open security decisions. Existing admin authorization provides a reusable route boundary, but approval and activation additionally require a defined fresh-authentication mechanism before implementation.

## Invariants

1. A proposal never mutates production routing, experiment records, or static catalog entries.
2. Approval is explicit and is bound to an immutable tuple: evidence snapshot, candidate model and generation configuration, routing role, exact tiers, cohort definition, percentage, time window, and fallback behavior.
3. Activation is explicit and separate from approval.
4. Missing, stale, malformed, ambiguous, unauthorized, or non-matching promotion data fails closed to baseline.
5. No role or tier is inferred. An empty or wildcard tier list is invalid; a request outside the exact approved tiers uses baseline.
6. Every state transition is atomic and audited with actor, timestamp, request/idempotency key, reason, before state, after state, immutable configuration digest, evidence digest, and outcome.
7. State transitions are compare-and-set operations. Retries with the same idempotency key return the original result; competing or conflicting requests fail without partial effects.
8. Approval and activation require fresh admin authentication as defined by the future security design, not merely a long-lived browser session.
9. Approval may be revoked before activation. Revoked approval cannot be activated or restored by retry; a new review and approval are required.
10. Automation may pause or roll back a rollout, but can never create, approve, activate, resume, promote, or expand one.
11. The static catalog is always sufficient to route. Overlay storage, cache, audit, evaluation, and observability failures never make the overlay mandatory.
12. Sensitive prompts, outputs, credentials, provider payloads, or user identifiers are not copied into proposal, audit, diagnostic, or metric labels.

## Evidence and review checklist

The immutable evidence snapshot reuses existing experiment results rather than recomputing a different story at approval time. At minimum it records:

- Experiment ID, status, candidate and control model IDs, providers, generation configurations, target country, activation/completion times, and source revision/version identifiers.
- Sample size, participants, days running, control/candidate/tie votes, decisive candidate share, and Wilson 95% interval.
- Partial failure rate and failure rate, including denominators and missing-data counts.
- Candidate and control time-to-first-token p50/p95 and total-generation p50/p95, with the Italy cohort identified where applicable.
- Candidate and control total cost, experiment overhead, measurement units, observation window, and missing cost counts.
- Candidate and control output tokens per second, with missing-data counts.
- Canonical positive, neutral, and negative feedback counts.
- The existing manual-readiness signal and its component facts. Its current implementation is a review convenience, not an approval threshold.
- Data-quality warnings, known incidents, exclusions, provider-routing differences, configuration drift, and manual analyst notes.

### Decision order

Review follows the product ordering below. A later dimension cannot compensate for a failed hard gate:

1. Reliability and safety hard gates.
2. Italy latency.
3. Cost.
4. Role-specific capability.
5. Output tokens per second.

This design deliberately does not invent numeric thresholds. Before implementation, product and safety owners must define the hard gates, allowed measurement uncertainty, evidence freshness window, minimum data completeness, acceptable regressions, and who may record a justified exception. Until those decisions exist, a proposal cannot become `REVIEWABLE`.

### Required proposal configuration

Reviewers must see and approve, without defaults that broaden impact:

- One exact candidate model and immutable generation configuration.
- One exact routing role.
- One or more exact model tiers, selected individually.
- A deterministic cohort rule and stable assignment key.
- An explicit rollout percentage and allocation behavior.
- An explicit start/end or maximum-duration policy.
- Explicit provider and model fallback behavior, including whether candidate failure retries the baseline model.
- Defined safety and operational guards, evaluation windows, pause behavior, and rollback behavior.
- The smallest canary configuration selected by product/operations.
- The policy for routing decisions already in flight at pause, rollback, or expiry.

The UI and API must never interpret omitted tiers, role, percentage, time, cohort, or fallback as “all,” “default,” or “current.” Product numeric thresholds, exact target tiers, the smallest canary, and in-flight behavior remain open decisions.

## Promotion state machine

The proposed primary path is:

`DRAFT -> REVIEWABLE -> APPROVED -> ROLLING_OUT -> ACTIVE`

Terminal or protective states are `REJECTED`, `PAUSED`, `ROLLED_BACK`, and `FAILED`. A state name describes the proposal/overlay lifecycle, not the underlying experiment lifecycle.

| Transition | Actor | Preconditions and effect | Idempotency and invalid response |
| --- | --- | --- | --- |
| create -> `DRAFT` | Analyst | References an existing experiment; stores no routing effect | Same creation key returns the same draft; conflicts return `409` |
| `DRAFT` -> `REVIEWABLE` | Analyst | Complete immutable evidence snapshot and configuration; all required product/security policies exist; validation succeeds | Same request returns snapshot; stale source/config digest or missing decision returns `409`/`422` |
| `DRAFT`/`REVIEWABLE` -> `REJECTED` | Authorized admin | Reason required; no routing effect | Repeated same rejection succeeds; terminal-state conflicts return `409` |
| `REVIEWABLE` -> `APPROVED` | Authorized admin with fresh auth | Reviews exact evidence/config digests; confirms gates in required order; records expiry and approval reason | Same key returns approval; stale evidence/config, expired fresh auth, or changed prerequisite returns `409`/`401`/`403` |
| `APPROVED` -> `REVIEWABLE` (revoke) | Approver or authorized admin with fresh auth | Allowed only before activation; reason required; invalidates approval token/version | Repeated revocation succeeds; activation race resolved by compare-and-set; loser gets `409` |
| `APPROVED` -> `ROLLING_OUT` | Authorized activating admin with fresh auth | Approval valid and unexpired; exact config unchanged; global and proposal kill switches permit; store/audit healthy; canary only | Same key returns activation; any mismatch/failure leaves routing at baseline and returns `409`/`503` |
| `ROLLING_OUT` -> `ACTIVE` | Authorized admin with fresh auth | Canary review complete against approved gates; no silent scope expansion; exact approved scope remains unchanged | Retry returns same result; failed/stale review returns `409`/`422` |
| `ROLLING_OUT`/`ACTIVE` -> `PAUSED` | Authorized admin or safety automation | Reason/guard evidence required; overlay becomes ineligible for new routing decisions | Repeated pause succeeds; baseline restoration does not wait on audit analytics |
| `PAUSED` -> `ROLLING_OUT` | Authorized admin with fresh auth | Original approval/config still valid, evidence and guards fresh, pause cause resolved; resumes at canary/revalidation stage | Automation cannot resume; invalid or expired approval returns `409` |
| `ROLLING_OUT`/`ACTIVE`/`PAUSED` -> `ROLLED_BACK` | Authorized admin, emergency operator, or safety automation | Reason required; terminal; overlay ineligible | Repeated rollback succeeds; new rollout requires a new proposal/approval |
| non-terminal -> `FAILED` | System on integrity/activation failure | Used when proposal integrity or transition execution cannot be trusted; overlay ineligible | Retry cannot reactivate; recovery requires review and a new proposal where appropriate |

Every transition writes the audit record in the same transaction as state/version changes. If that atomic write cannot commit, the transition fails. Runtime safety rollback must still have an independent, fail-safe disable path so inability to write an audit cannot keep unsafe traffic enabled; the diagnostic/audit reconciliation obligation is recorded as soon as the store recovers.

### Transition ownership and invalid requests

- Authorization is checked server-side for every write; UI visibility is not authorization.
- Fresh authentication is verified at approval and every activation/resume/expansion-equivalent action. Its method and validity duration are open decisions.
- Request bodies carry the expected state version, evidence digest, configuration digest, and idempotency key.
- Unknown actions or malformed inputs return `400`/`422`; missing authentication `401`; insufficient authorization `403`; missing proposal `404`; stale or invalid transition `409`; unavailable required integrity dependency `503`.
- Invalid requests do not partially update proposal, approval, overlay, cache, or audit state.
- State history is append-only. Corrections are new transitions, never audit rewrites.

## Runtime routing contract

### Baseline and overlay lookup

1. Resolve baseline policies from the static plan catalog and policy engine.
2. Read the promotion overlay through a bounded-time, versioned lookup.
3. Accept an overlay only if it is `ROLLING_OUT` or `ACTIVE`, within its approved time window, not paused/expired/killed, cryptographically or digest-integrity valid, and an exact match for role and tier.
4. Apply the deterministic cohort and percentage decision using the approved assignment key and configuration version.
5. Return the candidate and its approved fallback behavior only for a valid match. Otherwise return baseline unchanged.

The overlay cannot alter limits, voice policy, attachment retention, another model role, fallback lists outside its approved field, or tiers not explicitly named.

### Fail-closed behavior

Any invalid overlay record, timeout, store error, cache parse/version error, audit-health failure required by policy, evaluation error, missing field, stale approval, unknown enum, digest mismatch, or cohort-evaluation exception returns baseline and emits a bounded diagnostic. Diagnostics identify proposal/config version and reason code but contain no sensitive prompts, outputs, tokens, secrets, or user identity.

The system must distinguish “baseline by allocation” from “baseline due to promotion error” in metrics without exposing high-cardinality or sensitive labels.

### Cache and consistency

- Cache entries are signed or digest-verified versioned snapshots; partial records are invalid.
- Cache TTL, stale-read policy, propagation bound, and recovery time objective (RTO) are open operational decisions.
- A pause, rollback, expiry, or kill switch must invalidate or supersede cached active data. A cached record older than the accepted control-plane version cannot restore a rollout.
- Cold start, empty cache, cache/store disagreement, and cache corruption route to baseline.
- Activation is not reported successful until the durable state and required cache/version publication contract completes.

### In-flight requests

Whether a pause/rollback cancels, drains, or allows an already selected candidate request to complete is an explicit open product and safety decision. The decision must cover streaming, retries, tool calls, and canonical message persistence. Until selected, implementation must choose the safest baseline behavior and must not claim a stronger rollback RTO than it can verify.

### Automation and emergency controls

- Safety automation may only transition `ROLLING_OUT` or `ACTIVE` to `PAUSED` or `ROLLED_BACK` based on approved guard definitions.
- Automation cannot approve, activate, resume, expand, edit thresholds, or change scope.
- A manual emergency rollback bypasses non-safety workflow dependencies but still requires an authorized operator, reason, immutable event identity, and subsequent reconciliation/audit.
- Kill switches exist at global overlay, proposal, and rollout-evaluator levels. Disabling any one returns affected decisions to baseline.
- Static catalog deployment remains an independent recovery path; the overlay must not be required to turn itself off.

## Proposed data model

Names below are proposals, not schema commitments.

### `ModelRoutingPromotionProposal`

- Identity, experiment ID, state, state version, created/updated timestamps, creator.
- Evidence snapshot ID/digest and immutable rollout configuration ID/digest.
- Current approval ID, activation/expiry timestamps, pause/rollback/failure reason codes.
- No prompt/output content and no secret values.

### `ModelRoutingEvidenceSnapshot`

- Immutable experiment/variant identity and configurations.
- Existing results and denominators: votes, Wilson interval, failures, latency, cost, throughput, feedback, manual readiness.
- Evidence interval, country/cohort facts, completeness, known caveats, source revisions, schema/aggregator version, digest.

### `ModelRoutingPromotionConfig`

- Exact candidate, role, exact tier list, cohort rule/version, percentage, time policy, fallback behavior.
- Guard definitions, assignment salt/key reference (not secret value), and config digest.
- Immutable after `REVIEWABLE`; any edit creates a new config version and returns the proposal to review.

### `ModelRoutingPromotionApproval`

- Proposal/config/evidence digests, approver, fresh-auth proof reference, decision, reason, approved/expiry/revoked timestamps.
- Append-only; revocation creates an event and invalidates activation eligibility.

### `ModelRoutingPromotionAudit`

- Proposal, transition/action, actor type/ID, reason, request/idempotency key, before/after state and version, evidence/config digest, outcome, timestamp, correlation ID.
- Append-only with retention and access controls defined before implementation.

### `ModelRoutingOverlaySnapshot`

- Minimal immutable runtime record: proposal/config version, state, exact role/tiers, cohort/percentage, candidate/fallback, validity window, kill-switch version, integrity digest.
- Contains no experiment response content or admin authentication material.

## Proposed services and APIs

### Services

- `model-routing-promotion/evidence`: builds and verifies immutable snapshots from existing result aggregates.
- `model-routing-promotion/lifecycle`: enforces the state machine, authorization inputs, compare-and-set versions, idempotency, and atomic audit writes.
- `model-routing-promotion/approval`: validates fresh authentication and binds approval to exact digests.
- `model-routing-promotion/overlay-publisher`: publishes/removes minimal runtime snapshots and verifies propagation.
- `model-routing-promotion/resolver`: applies exact-match overlay semantics and fails to baseline.
- `model-routing-promotion/monitor`: evaluates approved guards and can only pause/roll back.
- `model-routing-promotion/recovery`: validates rollback, cache invalidation, audit reconciliation, and baseline restoration.

### API shape

Proposed admin endpoints follow the existing `requireAdmin` boundary, with stronger fresh-auth and authorization checks for sensitive transitions:

- `POST /api/admin/model-routing-promotions` creates a draft from an experiment.
- `GET /api/admin/model-routing-promotions/:id` returns proposal, immutable evidence/config, readiness failures, and audit history.
- `POST /api/admin/model-routing-promotions/:id/review` freezes evidence/config and requests reviewability.
- `POST /api/admin/model-routing-promotions/:id/approve` explicitly approves exact digests.
- `POST /api/admin/model-routing-promotions/:id/revoke` revokes before activation.
- `POST /api/admin/model-routing-promotions/:id/activate` starts the canary.
- `POST /api/admin/model-routing-promotions/:id/complete-canary` moves to the already approved active scope; it cannot expand scope.
- `POST /api/admin/model-routing-promotions/:id/pause` and `/resume` protect or revalidate rollout.
- `POST /api/admin/model-routing-promotions/:id/rollback` performs terminal rollback.
- `GET /api/admin/model-routing-promotions/:id/diagnostics` provides redacted health and propagation evidence.

All writes require expected version/digests, reason where applicable, and an idempotency key. Response bodies never include fresh-auth proofs, assignment secrets, credentials, prompt/output content, or unrestricted user identifiers.

## Admin UX

The staged admin experience is deliberately capability-gated:

1. **Persistence/read-only phase**: evidence and proposal detail are visible, but every routing action is disabled by a global overlay kill switch.
2. **Approval phase**: review checklist, evidence freshness/completeness, immutable digests, exact scope, fallback, open-decision resolution, and fresh-auth approval become available. Activation remains disabled.
3. **Disabled-overlay phase**: publish and validate an overlay that cannot receive traffic. Operators verify baseline fallback and diagnostics.
4. **Canary phase**: a separately authenticated activation applies only the explicitly approved smallest canary. No “select all tiers,” wildcard, pre-checked tier, or hidden percentage default exists.
5. **Drill phase**: pause, rollback, cache loss, store loss, stale snapshot, and emergency recovery are exercised before broader use.

Each phase has its own kill switch and an objective exit checklist. The UI shows the static baseline beside the proposed override, highlights every difference, and requires final typed/explicit confirmation of candidate, role, tiers, cohort, percentage, duration, fallback, evidence digest, and config digest. It never describes review readiness as “safe to promote.”

Paused, rolled-back, failed, expired, stale, or invalid proposals show no activation shortcut. Resuming requires a new guard review and fresh authentication. Any change to scope creates a new immutable configuration and returns to review.

## Observability and operations

### Metrics and structured events

- Routing decisions by `baseline`, `overlay_allocated`, and redacted fallback reason.
- Overlay lookup/cache latency, failures, version/digest mismatch, staleness, and propagation age.
- Candidate/control reliability and safety guard results, Italy latency, cost, role-capability measure, and tokens per second in the approved order.
- State-transition success/conflict/failure by action and actor type.
- Pause/rollback trigger, detection time, decision time, propagation time, and verified baseline restoration time.
- Cohort allocation balance and config version without user-level labels.

Alerts must include an actionable proposal/config version and runbook, not sensitive values. Observability failure itself follows the approved guard policy and can trigger pause/rollback, never expansion.

### Recovery runbook requirements

1. Invoke proposal or global kill switch.
2. Verify new decisions resolve to baseline across supported roles/tiers and deployment regions.
3. Invalidate/supersede overlay cache versions and verify no older snapshot can reappear.
4. Decide/verify in-flight handling under the approved policy.
5. Record/reconcile the rollback event and diagnostics.
6. Preserve evidence for incident review without storing sensitive conversation content.
7. Require a new proposal or explicitly allowed revalidation path before traffic can resume.

RTO and cache propagation targets remain open decisions and must be proven by drills rather than documentation alone.

## Security and threat model

| Threat | Required control |
| --- | --- |
| Stolen or stale admin session | Fresh authentication for approval, activation, resume, and any scope-equivalent change; short-lived single-purpose proof |
| Approval/config substitution | Bind approval to immutable evidence and config digests; display exact values at confirmation |
| Replay or double activation | Idempotency key, expected version, compare-and-set transition, single active result per request |
| Privilege escalation or UI bypass | Server-side role/capability checks on every endpoint; deny by default |
| Silent all-tier rollout | Exact non-empty tier allowlist; no wildcard/default; exact-match resolver |
| Automation promotes traffic | Separate machine capability restricted to pause/rollback actions |
| Store/cache tampering or corruption | Versioned integrity-checked snapshots; disagreement/malformed data returns baseline |
| Audit deletion or alteration | Append-only access-controlled audit, retention policy, integrity monitoring, reconciliation events |
| Sensitive-data leakage | Minimal snapshots, redacted reason codes, no prompts/outputs/secrets or identity in logs/labels |
| Stale evidence used after drift | Freshness policy, source/config digests, approval expiry, activation-time revalidation |
| Rollback blocked by control-plane failure | Independent global/proposal disable path and baseline-only runtime behavior |
| Cohort manipulation or instability | Versioned deterministic assignment, protected salt reference, allocation monitoring |
| Confused deputy across roles | Exact routing-role binding; overlay cannot affect other fields or roles |

## Test matrix

### State and authorization

- Every valid state transition, actor, prerequisite, audit before/after, and terminal-state behavior.
- Every invalid transition and malformed request returns the specified class without partial writes.
- Non-admin, wrong capability, expired fresh auth, revoked approval, stale version, stale evidence, and changed config fail closed.
- Approval/activation race and revoke/activation race have one compare-and-set winner.
- Same idempotency key returns the original result; same key with a different payload conflicts.
- Automation can pause/roll back and is denied create/approve/activate/resume/expand.

### Evidence and configuration

- Snapshot preserves existing votes, Wilson interval, failure rates, latency, cost, throughput, feedback, readiness, denominators, and missing-data facts.
- Snapshot/config changes alter digests and invalidate prior approval.
- Missing product thresholds, exact role, exact tiers, cohort, percentage, time, fallback, canary, or in-flight policy prevent reviewability.
- Reliability/safety hard-gate failure cannot be outweighed by latency, cost, capability, or throughput.
- Review display orders Italy latency, cost, role capability, then tokens per second after hard gates.

### Runtime routing

- Exact active role/tier/cohort/percentage/time match selects candidate; every non-match selects static baseline.
- Empty/wildcard/unknown tiers, roles, enums, versions, or digests select baseline.
- Missing store, timeout, exception, corrupt cache, stale cache, store/cache disagreement, evaluation failure, audit-health failure, and expired approval select baseline and emit redacted diagnostics.
- Overlay affects only the approved routing field; limits, voice, retention, other roles, and other tiers remain unchanged.
- Stable assignment is deterministic for the approved version and changes only under an approved new configuration.

### Safety, rollback, and recovery

- Each phase/global/proposal/evaluator kill switch independently restores baseline.
- Guard breach pauses or rolls back but never activates, resumes, or expands.
- Manual emergency rollback works when normal control-plane dependencies are degraded.
- Cache invalidation prevents an old active snapshot from resurfacing after pause/rollback.
- In-flight streaming, retries, tool calls, and persistence follow the selected policy.
- Recovery drill measures detection, propagation, and verified baseline restoration against the future RTO.

### Observability and privacy

- Transition and runtime metrics use bounded labels and distinguish allocation from error fallback.
- Logs, audits, diagnostics, and APIs exclude prompts, outputs, secrets, auth proofs, and unrestricted user identifiers.
- Missing telemetry follows the approved safety policy.
- Audit reconciliation after fail-safe rollback is detectable and complete.

## Staged delivery plan

Each stage is independently deployable only after its kill switch and preceding verification are in place:

1. **Persistence**: add proposed records, immutable digests, lifecycle validation, audit, and read-only APIs. Global overlay switch remains off.
2. **Read-only UI**: show evidence, readiness blockers, proposed scope, static baseline diff, and audit history. No approval or routing writes.
3. **Approval**: add fresh-auth approval/revocation and conflict/idempotency tests. Activation switch remains off.
4. **Disabled overlay**: publish integrity-checked runtime snapshots but force resolver to baseline; validate cache/store failures and diagnostics.
5. **Canary**: enable only the explicitly approved smallest canary after product/security decisions and rollback drill pass.
6. **Operational drill**: exercise automated pause, manual rollback, emergency rollback, cache/store degradation, reconciliation, and in-flight policy; verify RTO.
7. **Broader approved rollout**: only through a new immutable configuration and approval. No phase transition silently increases scope.

Migration/backfill must default every existing experiment and any new proposal to no routing effect. Deployment order is expand schema/storage, deploy read paths disabled, deploy writes disabled, validate, then enable one capability at a time. Rollback of any delivery phase leaves the static catalog usable.

## Open decisions required before implementation

- Numeric reliability and safety hard gates, measurement windows, denominators, and missing-data policy.
- Evidence freshness, completeness, minimum sample/diversity, and approval-expiry policies.
- Italy latency metric(s) and acceptable regression; cost units/window; role-capability evaluation method; throughput interpretation.
- Exact routing roles eligible for promotion and the exact target tiers for the first proposal.
- Cohort definition, stable assignment key, approved percentage, smallest canary, duration, and expansion cadence.
- Candidate failure/fallback/retry semantics and interaction with current provider routing.
- In-flight behavior for streams, retries, tool calls, and persistence on pause/rollback/expiry.
- Fresh-auth mechanism, validity duration, eligible roles, separation-of-duties requirement, and emergency operator authorization.
- Cache TTL/staleness/propagation bounds, overlay RTO, and behavior when audit or telemetry dependencies are unavailable.
- Safety monitor thresholds, observation windows, false-positive handling, and whether `PAUSED` can resume under the same approval.
- Audit retention, integrity mechanism, privacy access, incident export, and reconciliation ownership.
- Whether only one proposal may affect a role/tier at a time and the deterministic conflict policy if scopes overlap.
- Country/region semantics beyond the existing Italy-focused evidence and how geographic drift invalidates approval.

Until these decisions are recorded, the only valid runtime outcome is the static baseline.
