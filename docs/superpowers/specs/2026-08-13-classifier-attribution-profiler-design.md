# Classifier attribution in the response profiler

## Goal

Show the model and the provider actually used by the turn classifier in the
expanded response profiler. The provider must be the provider selected by
OpenRouter for that request, not OpenRouter itself and not a value inferred
from routing configuration.

## Data contract

The persisted execution-route trace gains two optional bounded strings:

- `classifierModel`: the model ID passed to the turn classifier.
- `classifierProvider`: the selected provider extracted from the classifier
  response's OpenRouter provider metadata.

Both properties remain optional. This preserves parsing and rendering of
historical traces, supports deterministic or legacy paths that do not call the
classifier, and avoids fabricating a provider when OpenRouter omits it.

## Data flow

After a classifier request completes, classification returns its model ID and
the selected provider alongside the proposal, outcome, and latency. Turn
arbitration propagates that attribution to the orchestrator. The orchestrator
copies it into every terminal execution-route trace, which is already persisted
with message metrics and exposed only through the existing expanded-profiler
authorization boundary.

Provider extraction reuses the existing bounded OpenRouter metadata parser used
for generation traces. A failed classifier may retain its model ID, but it has
no provider unless the completed response supplied provider metadata. Paths
that do not invoke the classifier expose neither field.

## Interface

The expanded profiler's **Esecuzione** section adds:

- **Modello classificatore**, rendered as a model identifier.
- **Provider classificatore**, rendered as a metric value.

Each row appears only when its value exists. The response-generation model and
provider remain separate and keep their current labels.

## Compatibility and security

No database migration is required because the fields are nested in the existing
JSON execution trace. Strict parsing accepts the two new optional properties and
continues accepting older traces without them. Compact metrics never expose the
new attribution, so the current production restriction to authorized
`SUPER_ADMIN` owners remains unchanged.

## Verification

Test-first coverage will verify:

1. classifier extraction of the actual selected OpenRouter provider;
2. propagation through arbitration into a terminal execution-route trace;
3. strict parsing of new traces and compatibility with legacy traces;
4. profiler rendering when attribution exists and omission when unavailable;
5. targeted AI, profiler, type, lint, and browser runtime checks.
