# Structured Light Eligibility

**Status:** Approved design follow-up to `2026-08-11-light-standard-turn-routing-design.md`

## Goal

Increase use of the `light` execution profile for clearly safe, self-contained
text transformations without weakening any coaching, tool, context, safety,
media, voice, token-limit, or classifier-failure guard.

## Problem

The classifier returns both structured workload dimensions and a
`suggestedProfile`. Live evaluation shows that Nemotron can classify a
self-contained rewrite correctly on every structured dimension while still
suggesting `standard`. The current policy treats that redundant suggestion as
an independent veto, producing a false-standard route even when every
authoritative guard is satisfied.

Lowering the confidence threshold would not address this case because the
incorrect suggestion is emitted with high confidence. Deterministically
forcing all transformations to `light` would be too broad because it could
ignore valid context, capability, sensitivity, or size signals.

## Decision

For these transformation task kinds only:

- `rewrite`
- `translate`
- `format`
- `extract`
- `summarize_supplied`

`suggestedProfile=standard` will not independently prevent `light` eligibility.
The server will derive eligibility from the existing structured and
deterministic guards:

- accepted, version-compatible agentic classification;
- workload confidence at or above `LIGHT_MIN_CONFIDENCE`;
- capability confidence at or above its existing threshold;
- minimal reasoning and ordinary sensitivity;
- no deep or missing recent context;
- no external knowledge requirement;
- no required or uncertain capability;
- no deterministic coaching or external-knowledge intent;
- text input, text response, and no pending approval;
- input and output within the existing light limits;
- no untrusted supplied-text instruction pattern.

For `social` and all non-transformation task kinds, the classifier's
`suggestedProfile` remains binding. Failures and uncertainty continue to route
to `standard`.

## Data Flow

`classifyTurn` continues to produce one proposal. Capability normalization
continues to remove only the already-approved spurious `rag` and `memoryWrite`
votes for self-contained transformations. `normalizeExecutionDecision` then
uses a narrow transformation predicate to decide whether the explicit profile
suggestion is required. Downstream planning, execution, retry, persistence,
and telemetry remain unchanged.

Reason codes remain truthful: a safe transformation may retain
`classifier_standard` while receiving `eligibleProfile=light`, showing that
server policy overruled only the redundant suggestion.

## Verification

Test-driven implementation will first add a failing execution-routing test for
a fully safe rewrite with `suggestedProfile=standard`. Existing veto tests must
remain green, including coaching, external knowledge, deep context,
capabilities, uncertainty, media, voice, pending approval, token limits, and
untrusted supplied text.

The live bilingual routing evaluation must finish with:

- 36 valid classifications, allowing the existing single transient failure
  tolerance in the gate;
- zero protected false-light routes;
- no more than two false-standard routes, with a target of 12/12 expected light
  fixtures on the measured run.

