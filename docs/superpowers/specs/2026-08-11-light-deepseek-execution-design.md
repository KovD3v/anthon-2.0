# Light DeepSeek Execution Design

**Date:** 2026-08-11
**Status:** Approved addendum to `2026-08-11-light-standard-turn-routing-design.md`

## Decision

Map an active `light` execution attempt to
`deepseek/deepseek-v4-flash-0731`. Keep the plan-resolved orchestrator model
for every `standard` attempt. Today that primary standard model is
`openai/gpt-5.6-luna`.

This is an execution-boundary decision. The classifier continues to return
only `light` or `standard`; it never chooses a model or provider.

## Attempt resolution

Resolve the model independently for each attempt after `TurnPlan` has fixed
the execution profile:

- a production light attempt uses `deepseek/deepseek-v4-flash-0731`;
- a standard turn uses the existing plan-resolved standard model;
- a light-to-standard pre-stream escalation switches back to that standard
  model rather than retrying DeepSeek with the standard prompt;
- an explicit benchmark model remains authoritative for controlled model
  comparisons and is not silently replaced by the production light model;
- direct media and tool-bearing turns remain standard and therefore never
  enter the DeepSeek light path.

The existing plan-level orchestrator fallback configuration is outside this
addendum. This change does not alter subscription entitlements or the global
model catalog.

## Provider routing

For the production DeepSeek light attempt, Anthon supplies a closed, safe
OpenRouter pool:

```ts
provider: {
  sort: "latency",
  only: ["Together", "CoreWeave", "Ambient"],
  allow_fallbacks: true,
  require_parameters: true,
  max_price: {
    prompt: 0.15,
    completion: 0.30,
  },
}
```

OpenRouter owns ordering inside this pool. Any global `order` value is removed
for this attempt so it cannot compete with `sort: "latency"`. Other compatible
privacy and routing constraints may be retained, but they cannot widen the
provider pool or price ceiling.

Provider fallback stays within the same DeepSeek model. If every allowed
provider fails before visible output, the existing profile escalation runs one
standard attempt through the standard model.

## Metrics and persistence

The delivered generation must be attributed to the model that produced it:

- a successful first attempt records DeepSeek as the generation model;
- a successful standard escalation records the standard model;
- the immutable execution route still records eligible, planned, and executed
  profile plus both attempt timings and costs.

Provider identity already exposed by OpenRouter response metadata remains the
source for delivered-generation provider telemetry. Building a continuously
learned rolling provider-health store from production observations is a later
phase; this addendum only establishes the safe initial pool and preserves the
data needed for that phase.

## Failure behavior

No new retry layer is introduced. The existing rules remain authoritative:

- provider fallback may occur inside the DeepSeek light request;
- a provider error or empty response before visible output escalates once to
  standard;
- a visible light stream is never replaced mid-response;
- cancellation does not escalate;
- malformed routing configuration fails closed rather than widening the pool.

## Verification

Behavioral tests must prove that:

1. a production active-light attempt creates DeepSeek with the closed provider
   pool and price ceiling;
2. its standard fallback creates the plan-resolved standard model and standard
   provider options;
3. a normal standard turn never creates the light model;
4. an explicit benchmark model is preserved;
5. delivered metrics use the delivered attempt's model ID;
6. existing profile escalation, telemetry, channel, and persistence tests stay
   green.
