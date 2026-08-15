# Pinned-provider OpenRouter Latency Probe

- Run label: `latency-2026-08-15-pinned-deepseek-gemini-luna`
- Authentication: separate `OPENROUTER_API_KEY` from `.env.benchmark`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Request: streaming, `max_tokens=1024`, one fixed short Italian prompt
- Repetitions: 5 per model, sequentially, no concurrency
- Provider policy: `only=[provider]`, `allow_fallbacks=false`, `require_parameters=true`
- Luna additionally used `service_tier=priority`

| Model | Pinned provider | First visible text avg / p50 / p95 | Total avg / p50 / p95 | Success |
| --- | --- | ---: | ---: | ---: |
| `google/gemini-3.7-flash` | Google AI Studio | 2276 / 2009 / 3285 ms | 2312 / 2051 / 3307 ms | 5/5 |
| `deepseek/deepseek-v4-pro-0813` | DeepSeek | 2700 / 2739 / 2829 ms | 2892 / 2940 / 2962 ms | 5/5 |
| `deepseek/deepseek-v4-flash-0731` | CoreWeave | 6601 / 6848 / 11545 ms | 6738 / 6919 / 11642 ms | 5/5 |
| `openai/gpt-5.6-luna` | OpenAI Priority | 626 / 598 / 709 ms | 820 / 793 / 930 ms | 5/5 |

## Interpretation

All four requested providers were confirmed in every response and no request was allowed to fall back. Luna was the fastest model in this run.

DeepSeek Flash remained on the correct CoreWeave provider, but today it showed a large streaming tail: one response reached 11.5 seconds to first visible text and 11.6 seconds total. This is provider variability on CoreWeave, not a routing switch to Sail Research.

All 20 requests returned HTTP 200. `firstAnyMs` and `firstContentMs` remain separate: the former includes reasoning deltas, while the latter is the first visible text delta.

