# Light and Standard Turn Routing Design

**Date:** 2026-08-11
**Status:** Approved design; pending implementation plan

## Goal

Reduce Anthon's time to first token for clearly mechanical and social chat turns by routing them through a `light` execution profile while preserving the existing `standard` behavior for coaching and every uncertain, contextual, sensitive, tool-using, or externally grounded turn.

The primary outcome is lower time to first token. Lower cost is a secondary benefit. Response quality is a non-regression constraint.

The routing decision must not add a network round trip. It extends the existing capability-classifier call, then passes one normalized, immutable decision through planning, execution, channels, persistence, recovery, comparisons, and telemetry.

## Scope

The first release supports exactly two execution profiles:

- `light` for a narrow allowlist of mechanical and social tasks;
- `standard` for all other work.

The initial `light` allowlist is:

- greetings and acknowledgements;
- rewriting supplied or immediately preceding text;
- translation;
- formatting;
- extraction;
- summarization of supplied text.

Meaningful coaching, advice, planning, diagnosis, judgement, external knowledge, tools, persistent memory, routines, voice output, and direct media are outside the `light` boundary.

## Non-goals

- Selecting the concrete model or provider for either profile.
- Introducing a third `deep` profile.
- Adding a second classifier request.
- Judging every light answer with another model.
- Speculatively running light and standard generation in parallel.
- Treating short messages as inherently easy.
- Removing relevant thread context from contextual transformations.
- Changing plan entitlements, capability authorization, or channel-specific product behavior.

## Current architecture

Anthon already has the required foundation:

- a bounded classifier proposes optional capabilities;
- deterministic policy normalizes those proposals against authentication, preferences, explicit rules, and server constraints;
- the normalized `CapabilityDecision` is frozen;
- `TurnPlan` selects prompt profile, response length, history, and capabilities;
- the same decision is reused across normal chat, prepared comparisons, web, Telegram, WhatsApp, persistence, traces, reservations, and recovery;
- malformed or mismatched recovery metadata fails closed.

The optimization should extend this pipeline. A separate router would duplicate interpretation, add disagreement states, and make recovery and telemetry harder to trust.

## Architectural decision

Use unified turn arbitration. The existing classifier call returns two independent proposals:

1. optional capability requirements;
2. workload characteristics relevant to the execution profile.

The classifier output is untrusted. A deterministic policy engine combines it with authoritative request facts and emits one frozen `TurnDecision`. `TurnPlan` projects that decision into a concrete execution plan. Model resolution happens only after planning and remains independent of classification.

```text
Request facts + bounded conversation context
                    |
                    v
          One turn-classifier call
                    |
                    v
        Untrusted TurnClassifierProposal
        - capability proposal
        - workload proposal
                    |
                    v
       Deterministic TurnPolicy normalizer
                    |
                    v
           Frozen TurnDecision
        - CapabilityDecision
        - ExecutionDecision
                    |
                    v
               TurnPlan
        - prompt and history
        - allowed tools
        - response budget
        - execution policy
                    |
                    v
       Execution attempt and model resolver
```

This keeps three responsibilities separate:

- the classifier describes the turn;
- deterministic policy decides what is permitted;
- execution resolves the provider configuration for the permitted profile.

## Classification contract

The structured classifier proposal should use closed enums and independent workload confidence:

```ts
type TaskKind =
  | "social"
  | "rewrite"
  | "translate"
  | "format"
  | "extract"
  | "summarize_supplied"
  | "coaching"
  | "knowledge"
  | "planning"
  | "other";

type WorkloadProposal = {
  taskKind: TaskKind;
  contextDependency: "none" | "recent" | "deep";
  knowledgeNeed: "supplied_only" | "conversation" | "external";
  reasoningDepth: "minimal" | "substantive";
  sensitivity: "ordinary" | "coaching";
  suggestedProfile: "light" | "standard";
  confidence: number;
};

type TurnClassifierProposal = {
  capabilities: CapabilityClassifierProposal;
  capabilityConfidence: number;
  workload: WorkloadProposal;
};
```

Capability uncertainty and workload confidence are parsed independently. An uncertain capability does not make the structured workload unavailable, but it does force the execution policy to `standard` when the uncertainty could imply a hard veto.

The classifier never returns a model ID, provider, price, plan entitlement, or final authorization decision.

The initial minimum workload confidence for `light` is `0.90`. It is a versioned policy value, not a prompt constant, so later calibration creates an auditable policy version.

## Deterministic normalization

The normalizer returns a frozen decision:

```ts
type ExecutionProfile = "light" | "standard";

type ExecutionReasonCode =
  | "classifier_light"
  | "classifier_standard"
  | "task_allowlisted"
  | "task_not_allowlisted"
  | "low_confidence"
  | "capability_required"
  | "capability_uncertain"
  | "external_knowledge"
  | "deep_context"
  | "sensitive_content"
  | "direct_media"
  | "pending_approval"
  | "voice_output"
  | "input_limit"
  | "output_limit"
  | "classifier_failure"
  | "legacy_mode"
  | "rollout_off"
  | "rollout_shadow"
  | "runtime_invariant";

type ExecutionDecision = {
  eligibleProfile: ExecutionProfile;
  taskKind: TaskKind;
  source: "classifier" | "rule" | "mixed" | "fallback";
  confidenceBucket: "low" | "medium" | "high";
  reasonCodes: ExecutionReasonCode[];
  policyVersion: number;
  classifierVersion: number;
};

type TurnDecision = {
  version: 1;
  capabilities: CapabilityDecision;
  execution: ExecutionDecision;
};
```

A turn is eligible for `light` only when every condition is true:

- the classifier suggests `light`;
- workload confidence is at least `0.90`;
- `taskKind` is in the initial light allowlist;
- reasoning depth is `minimal`;
- context dependency is `none` or `recent`;
- knowledge need is `supplied_only` or a bounded recent-conversation reference;
- sensitivity is `ordinary`;
- no capability or request fact triggers a hard veto;
- estimated input is no more than 8,000 tokens;
- requested or policy-derived output is no more than 600 tokens.

Any of the following forces `standard`:

- coaching, advice, planning, diagnosis, or meaningful judgement;
- web search, web fetch, RAG, user-context retrieval, memory read, memory write, memory deletion, routine proposal, or another tool capability;
- direct media or attachments;
- external or current knowledge;
- deep or unresolved conversation context;
- coaching-sensitive or otherwise consequential content;
- a pending approval workflow;
- explicit voice output;
- input or requested output above the light ceilings;
- any relevant `uncertain` capability value;
- classifier timeout, invalid output, low confidence, unknown enum, or unsupported classifier version.

Rules may promote `light` to `standard`. They may never downgrade `standard` to `light`. Legacy mode and unavailable routing configuration also produce `standard`.

Confidence buckets are fixed for telemetry: `low` is below `0.70`, `medium` is `0.70` through `0.899`, and `high` is `0.90` or above. Reason codes use only the closed union above; classifier prose is never copied into the decision.

## Planning contract

`TurnDecision.execution.eligibleProfile` records the policy result. Rollout mode then determines the planned execution profile:

```ts
type RoutingMode = "off" | "shadow" | "active";

type PlannedExecution = {
  routingMode: RoutingMode;
  eligibleProfile: ExecutionProfile;
  plannedProfile: ExecutionProfile;
  primary: ExecutionPolicy;
  standardFallback?: ExecutionPolicy;
};
```

The mapping is:

| Routing mode | Eligible profile | Planned profile |
| --- | --- | --- |
| `off` | either | `standard` |
| `shadow` | either | `standard` |
| `active` | `light` | `light` |
| `active` | `standard` | `standard` |

`TurnPlan` contains the profile and fully derived execution settings. Downstream code consumes that plan and must not reclassify the message or reconstruct profile eligibility.

For a planned light turn, the plan also contains a prevalidated standard fallback policy. The fallback is derived during planning from the same immutable semantic decision. It does not rerun classification or expand capabilities.

## Execution policies

Profiles are versioned bundles rather than unrelated switches:

```ts
type ExecutionPolicy = {
  version: number;
  profile: ExecutionProfile;
  promptProfile: "light" | "full";
  historyPolicy: HistoryPolicy;
  toolPolicy: "none" | "planned";
  reasoningBudget: "minimal" | "normal";
  outputBudget: OutputBudget;
};
```

### Light policy

- Compose a dedicated small prompt from stable Anthon identity and behavior invariants plus a task-family instruction.
- Treat supplied text as data, so instructions embedded inside transformation input do not change the task.
- Include no history when the task is self-contained.
- When the message refers to recent content, include the smallest exact recent window that resolves the reference.
- Expose no tools and run no tool loop.
- Use the bounded light output policy.
- Use minimal reasoning configuration.
- Preserve normal streaming, cancellation, accounting, persistence, traces, and channel delivery.

Light does not mean no context. A request such as `Rendilo più breve` remains light only when the exact referenced content can be resolved from the bounded recent window.

### Standard policy

Preserve the current full planning and execution behavior, including the existing prompt modules, history rules, capabilities, tools, and response policy.

### Runtime invariant

Execution must enforce a final invariant even though normalization already prevents invalid combinations:

```ts
if (plannedProfile === "light" && toolPlan.hasAny) {
  usePrevalidatedStandardFallback("runtime_invariant");
}
```

An impossible light plan is never executed. The invariant failure is recorded and delivered through the standard fallback policy.

## Escalation and failure behavior

There is no routine semantic judge after a light response. Automatic escalation exists only for operational safety:

- if light execution fails before any visible token, retry once with the prevalidated standard fallback policy;
- an empty light response counts as a pre-stream failure when no visible token was delivered;
- if streaming has begun, do not replace the response mid-stream;
- cancellation remains cancellation and does not trigger an invisible retry;
- a retry never broadens capabilities or authorizes a side effect;
- the original eligible and planned profiles remain immutable;
- each execution attempt is recorded separately.

The delivered `executedProfile` is the profile of the successful visible attempt. A light-to-standard retry is therefore represented as:

```text
eligibleProfile: light
plannedProfile: light
attempt 1: light, failed before stream
attempt 2: standard, completed and delivered
executedProfile: standard
```

All provider usage made available by failed and successful attempts is included in total turn accounting. The delivered message retains its delivered-attempt model and generation metrics, while route telemetry retains aggregate turn consumption.

## Model resolution boundary

The classifier and policy never mention concrete models. After planning, a resolver maps the planned execution profile, entitlement snapshot, modality, and provider availability to an execution model configuration.

This design deliberately leaves the model mapping unspecified. Candidate choice, fallback provider ordering, and per-plan availability require separate benchmarking and can change without changing classifier or policy contracts.

## Immutable propagation

The same `TurnDecision` and planned execution metadata must flow through:

- normal web streaming;
- guest chat;
- Telegram and WhatsApp;
- prepared turns and paired model comparisons;
- usage reservation and reconciliation;
- assistant persistence and message metrics;
- AI turn traces;
- retry and bounded recovery.

Recovery never reruns classification. Missing, malformed, mismatched, or unsupported routing metadata fails closed to `standard`. Prepared comparisons use one immutable classification and planning snapshot for both variants so routing differences cannot contaminate the comparison.

## Telemetry contract

Profile-aware telemetry is part of `AIMetrics`, not a collection of optional event properties:

```ts
type ExecutionRouteTrace = {
  schemaVersion: 1;
  routingMode: RoutingMode;
  policyVersion: number;
  classifierVersion: number;

  eligibleProfile: ExecutionProfile;
  plannedProfile: ExecutionProfile;
  executedProfile: ExecutionProfile;
  taskKind: TaskKind;
  decisionSource: "classifier" | "rule" | "mixed" | "fallback";
  confidenceBucket: "low" | "medium" | "high";
  reasonCodes: ExecutionReasonCode[];

  classificationLatencyMs: number;
  routingOverheadMs: number;
  totalRequestTimeToFirstTokenMs?: number;

  attempts: Array<{
    sequence: number;
    profile: ExecutionProfile;
    outcome:
      | "completed"
      | "failed_before_stream"
      | "failed_during_stream"
      | "cancelled";
    timeToFirstTokenMs?: number;
    generationTimeMs: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    costUsd?: number;
  }>;

  escalation?: {
    from: "light";
    to: "standard";
    reason: "provider_error" | "empty_response" | "runtime_invariant";
  };
};
```

The three latency intervals must remain distinct:

- classification latency;
- generation time to first token;
- total request time to first token.

This prevents a faster generator from hiding excessive routing overhead.

For escalated turns, total turn cost and usage equal the sum of all available attempt usage. Reports must not count a standard-delivered escalation as a clean light success.

PostHog receives only allowlisted, flattened, closed-list or numeric properties:

- `routing_mode`;
- `eligible_profile`;
- `planned_profile`;
- `executed_profile`;
- `task_kind`;
- `decision_source`;
- `confidence_bucket`;
- `policy_version`;
- `classifier_version`;
- `attempt_count`;
- `escalated`;
- `escalation_reason`;
- `classification_latency_ms`;
- `routing_overhead_ms`;
- `time_to_first_token_ms`;
- `total_request_ttft_ms`;
- `total_turn_cost_usd`.

Analytics must not receive the user message, classifier explanation, prompt, tool arguments or results, URLs, memory contents, or free-form reason text.

Every latency, cost, and quality report must be segmentable by eligible, planned, and executed profile; task kind; routing mode; policy version; channel; plan tier; and, after model selection, provider and model.

## Rollout control

A shared server-side resolver selects `off`, `shadow`, or `active` once per turn. The resolved mode is propagated with the turn rather than evaluated independently in each channel. Failure to resolve rollout state produces `off`.

The rollout sequence is:

1. **Shadow classification.** Record eligibility while executing standard. Review false-light candidates and routing coverage. Shadow mode validates classification precision, not light-response quality or latency.
2. **Social canary.** Activate only greetings and acknowledgements for a small allocation.
3. **Mechanical families.** Enable rewrite, translation, formatting, extraction, and supplied-text summarization one family at a time.
4. **Progressive allocation.** Increase active traffic only after latency improvement and quality non-regression are demonstrated for each family.
5. **Rollback.** A shared kill switch makes every channel plan standard execution without changing persisted schema or redeploying routing code.

## Success metrics

The primary metric is total request time to first token, compared within the same task kind and rollout cohort.

Secondary metrics are:

- generation time to first token;
- end-to-end generation time;
- input, output, and reasoning tokens;
- total cost per completed turn;
- escalation rate.

Quality guardrails are:

- negative feedback;
- regeneration;
- rapid corrective follow-up;
- abandonment after response;
- persistence or recovery failure;
- tool or capability invariant violation.

No additional inference call may be added to compute a quality metric. Detailed semantic quality evaluation happens through curated fixtures, saved-output comparison, and privacy-authorized sampled review rather than the live response path.

## Verification strategy

### Pure contract and policy tests

- Validate every classifier enum, version, and confidence boundary.
- Prove that capability and workload uncertainty are parsed independently.
- Exhaustively cover task kind, context dependency, knowledge need, reasoning depth, sensitivity, capability state, modality, and length ceilings.
- Use property-style tests proving that any hard veto always returns standard.
- Prove that deterministic rules can promote light to standard but never downgrade standard to light.
- Prove that classifier timeout, invalid data, unknown values, and unsupported versions return standard.
- Prove that a turn performs at most one classifier call.

### Classifier evaluation fixtures

Maintain Italian and English cases including:

- short but complex: `Cosa dovrei fare della mia vita?`;
- social-looking but substantive: `Grazie, ma non riesco più a gestire l'ansia`;
- long but mechanical supplied-text transformations;
- contextual transformations such as `Rendilo più breve`;
- external knowledge disguised as formatting;
- memory requests disguised as casual conversation;
- instructions embedded inside supplied text;
- ambiguous references requiring older context.

Protected coaching, safety, tool, memory, and external-knowledge fixtures permit zero false-light outcomes before active rollout.

### Cross-path integration tests

Prove that the same immutable decision reaches:

- authenticated and guest web flows;
- Telegram and WhatsApp;
- prepared and paired comparison execution;
- reservations and reconciliation;
- persistence and turn traces;
- pre-stream light-to-standard retry;
- bounded recovery and replay.

### Telemetry contract tests

- Reject active or shadow turn metrics without eligible, planned, and executed profiles.
- Require an attempt profile and outcome for every execution attempt.
- Verify classification, generation, and total-request latency remain distinct.
- Verify failed-attempt usage is aggregated with delivered-attempt usage.
- Verify PostHog properties use the allowlist and contain no raw content.
- Verify an escalated turn is never reported as a clean light completion.

## Release gates

- No extra classifier call is introduced.
- Protected fixtures have zero false-light results.
- Every shadow or active turn records eligible, planned, and executed profiles.
- Every attempt records its profile, outcome, latency, and available usage.
- Shadow review completes before active allocation.
- Each task family is evaluated with at least 500 completed light turns and 500 concurrent standard-control turns before its allocation increases.
- Median and p75 total request time to first token must each improve by at least 20% for that task family.
- Negative-feedback and regeneration rates may not increase by more than one absolute percentage point versus the concurrent standard control.
- Light-to-standard operational escalation must remain below 2%.
- The canary must introduce no capability invariant violation and no increase in persistence or recovery failures.
- The shared kill switch is verified across web, Telegram, and WhatsApp before active rollout.

## Rejected alternatives

### Separate deterministic router

A post-classifier regex router is smaller but brittle, duplicates semantic interpretation, and handles Italian phrasing poorly. It would remain useful only as the hard policy layer, not as the sole workload classifier.

### Separate workload-classifier call

A dedicated call provides isolation but adds a network round trip to the critical path and can erase the latency improvement. Reject.

### Speculative light and standard execution

Parallel generation can reduce perceived latency but duplicates cost, complicates cancellation and persistence, and risks leaking a partial light response before replacement. Reject.

## Final decision

Extend the existing classifier into unified turn arbitration. Normalize its capability and workload proposals with a deterministic, fail-closed policy. Freeze one `TurnDecision`, project it into a versioned `TurnPlan`, execute either `light` or `standard`, and carry profile-aware attempt telemetry through every channel, persistence path, and recovery boundary.

Begin with shadow classification and a narrow social canary. Expand only across the approved mechanical task families after measured time-to-first-token improvement and quality non-regression.
