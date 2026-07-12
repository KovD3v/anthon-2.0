# Voice classifier selection — 2026-07-12

## Decision

Use `google/gemini-2.5-flash-lite` as the default voice-suitability
classifier. Keep `mistralai/ministral-3b-2512` as the benchmark comparison,
not as a runtime fallback.

The classifier uses:

- a 1,500 ms total timeout;
- zero retries;
- OpenRouter latency sorting;
- `require_parameters: true` for structured output support;
- text fallback when classification fails.

Explicit voice and text requests remain deterministic and do not call this
model.

## Method

The benchmark ran from the local client network in Italy on July 12, 2026.
It used eight synthetic Italian coaching scenarios, sequential requests,
alternating model order, structured Zod output, no retries, and a 1,500 ms
timeout.

Two batches of 100 requests per model were executed, for 200 requests per
model in total. No private conversation content was used.

## Results

| Model | Successful | Exact-category accuracy | Delivery-mode accuracy | p50 range | p95 range | p99 range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-2.5-flash-lite` | 200/200 | 87.0% | 100% | 362–381 ms | 515–530 ms | 670–704 ms |
| `mistralai/ministral-3b-2512` | 199/200 | 95.0% | 100% | 398–413 ms | 675–701 ms | 854–859 ms |

Ministral had one timeout. Gemini had none.

Gemini's exact-category misses were all on the motivational-story scenario:
it returned `VOICE_STRONG` instead of `VOICE_NATURAL`. That distinction does
not change voice versus text delivery, and the production deterministic layer
already classifies the scenario's explicit motivation signal as strong before
the model is invoked.

Ministral occasionally returned `TEXT_PREFERRED` instead of `TEXT_REQUIRED`
for a structured-table request. That distinction also remains text delivery.

## Conclusion

Gemini wins on the product's primary criterion: Italy-side end-to-end latency,
especially p95 and p99. Both models were equivalent on the final voice-versus-
text decision across successful runs. Gemini also had the better success rate
under the production timeout.

The reusable harness is `scripts/benchmark-voice-classifier.ts`.
