# Pinned-provider OpenRouter Latency Probe

- Run label: `latency-2026-08-14-pinned-deepseek-gemini`
- Authentication: separate `OPENROUTER_API_KEY` from `.env.benchmark`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Request: streaming, `max_tokens=1024`, one fixed short Italian prompt
- Repetitions: 5 per model, sequentially, no concurrency
- Provider policy: `only=[provider]`, `allow_fallbacks=false`, `require_parameters=true`

| Model | Pinned provider | First visible text avg / p50 / p95 | Total avg / p50 / p95 | Success |
| --- | --- | ---: | ---: | ---: |
| `google/gemini-3.7-flash` | Google AI Studio | 2361 / 2211 / 3363 ms | 2392 / 2211 / 3454 ms | 5/5 |
| `deepseek/deepseek-v4-pro-0813` | DeepSeek | 2658 / 2681 / 2964 ms | 2828 / 2788 / 3142 ms | 5/5 |
| `deepseek/deepseek-v4-flash-0731` | CoreWeave | 2756 / 2541 / 3614 ms | 2811 / 2609 / 3660 ms | 5/5 |
| `openai/gpt-5.6-luna` | OpenAI | 876 / 787 / 1256 ms | 1182 / 974 / 1838 ms | 5/5 |

## Interpretation

The provider was pinned and confirmed in every response: Google AI Studio, DeepSeek, CoreWeave, and OpenAI respectively. Luna used `service_tier=priority` to match Anthon's current routing. No request was allowed to fall back to another provider.

The DeepSeek Flash result is materially different from the previous default-routing probe: CoreWeave completed in 2811 ms average with a 3660 ms p95, while the unpinned Sail Research probe averaged 18184 ms and reached 40655 ms at p95. The earlier high latency was therefore provider-specific, not intrinsic to the model ID.

All 20 requests returned HTTP 200. `firstAnyMs` and `firstContentMs` are kept separate: the former includes reasoning deltas, while the latter is the first visible text delta.
