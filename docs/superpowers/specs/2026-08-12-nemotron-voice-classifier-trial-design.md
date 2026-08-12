# Nemotron voice-classifier trial

## Goal

Determine whether `nvidia/nemotron-3.5-lightning` can replace
`google/gemini-2.5-flash-lite` for automatic voice suitability without
reducing delivery correctness or reliability. Gemini remains the runtime
default until every gate below passes.

## Scope

The trial covers only automatic voice-versus-text suitability. Explicit voice
and explicit text requests remain deterministic. Transcription, voice
generation, unified turn classification, and RAG classification are unchanged.

At most two Nemotron variants may be tested. If both fail, stop the trial and
retain Gemini without adding a runtime fallback.

## Decision pipeline

The server remains authoritative before the model call. Clearly text-only
requests, including link-only responses and short factual answers, resolve to
text deterministically alongside the existing code, table, exact-command, and
structured-coaching vetoes.

Only ambiguous conversational cases reach the model. Nemotron must use the
bounded classifier route:

- DeepInfra structured-output endpoint;
- reasoning disabled;
- zero retries;
- 1,500 ms total timeout;
- fail closed to text;
- the smallest output budget that reliably produces the existing schema.

Variant A adds a conservative decision hierarchy and compact counterexamples
for short factual and link-only requests. Variant B may simplify or reorder
those instructions based on Variant A evidence, but must not change the schema,
timeout, scenarios, or pass criteria.

## Evaluation

Each variant first runs the existing eight-scenario alternating-order smoke
test. It advances only with valid output on every attempt, correct end-to-end
voice-versus-text delivery on every scenario, and zero protected false-voice
decisions.

A passing smoke candidate is compared with Gemini over 200 requests per model
from the local client network. The report records success rate, raw category
accuracy, end-to-end delivery accuracy, protected false-voice count, p50, p95,
p99, provider, and failure mix.

Nemotron may replace Gemini only if it achieves all of the following:

- at least 199 valid outputs out of 200;
- 100% end-to-end voice-versus-text accuracy;
- zero protected false-voice decisions;
- p95 no higher than 600 ms;
- no regression in deterministic explicit voice or text behavior.

## Testing and rollout

Production changes use test-driven development. Tests cover the new
deterministic vetoes, Nemotron classifier routing, fail-closed behavior, and
unchanged explicit-mode precedence. The focused voice suite, full unit suite,
TypeScript check, scoped Biome check, and live benchmark must pass before a
scoped commit.

No deployment, push, or production environment change is part of this trial.
