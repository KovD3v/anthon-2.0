# Pinned-provider OpenRouter Latency Probe

- Run label: `latency-2026-08-15-pinned-deepseek-gemini-luna-rerun-20260815-144311`
- Authentication: separate `OPENROUTER_API_KEY` from `.env.benchmark`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Request: streaming, `max_tokens=1024`, one fixed short Italian prompt
- Repetitions: 5 per model, sequentially, no concurrency
- Provider policy: `only=[provider]`, `allow_fallbacks=false`, `require_parameters=true`
- Luna additionally used `service_tier=priority`

| Model | Pinned provider | First visible text avg / p50 / p95 | Total avg / p50 / p95 | Success |
| --- | --- | ---: | ---: | ---: |
| `google/gemini-3.7-flash` | Google AI Studio | 3109 / 2081 / 7437 ms | 3166 / 2176 / 7456 ms | 5/5 |
| `deepseek/deepseek-v4-pro-0813` | DeepSeek | 3549 / 3202 / 5953 ms | 3845 / 3672 / 6174 ms | 5/5 |
| `deepseek/deepseek-v4-flash-0731` | CoreWeave | 5433 / 5608 / 9642 ms | 5659 / 5684 / 9726 ms | 5/5 |
| `openai/gpt-5.6-luna` | OpenAI Priority | 696 / 727 / 764 ms | 972 / 1009 / 1056 ms | 5/5 |

## Interpretation

All four requested providers were confirmed in every response and no request was allowed to fall back. Luna was again clearly the fastest model.

This fresh sample shows higher tail latency than the previous run for Gemini and both DeepSeek models: Gemini had one 7456 ms completion, DeepSeek Pro one 6174 ms completion, and DeepSeek Flash one 9726 ms completion. DeepSeek Flash still used CoreWeave throughout; the variability is provider-side timing within the pinned provider, not a routing change.

All 20 requests returned HTTP 200. `firstAnyMs` and `firstContentMs` remain separate: the former includes reasoning deltas, while the latter is the first visible text delta.
