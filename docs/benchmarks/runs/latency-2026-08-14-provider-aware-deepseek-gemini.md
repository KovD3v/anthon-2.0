# Provider-aware OpenRouter Latency Probe

- Run label: `latency-2026-08-14-provider-aware-deepseek-gemini`
- Authentication: separate `OPENROUTER_API_KEY` from `.env.benchmark`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Request: streaming, `max_tokens=1024`, one fixed short Italian prompt
- Repetitions: 5 per model, sequentially, no concurrency
- Provider capture: the top-level `provider` field returned in the SSE chunks; the provider was not inferred from the model ID

| Model | Providers observed | First visible text avg / p50 / p95 | Total avg / p50 / p95 | Errors |
| --- | --- | ---: | ---: | ---: |
| `google/gemini-3.7-flash` | Google (5/5) | 3578 / 3282 / 4765 ms | 3735 / 3471 / 4935 ms | 0 |
| `deepseek/deepseek-v4-pro-0813` | DeepSeek (4/5), GMICloud (1/5) | 3085 / 2654 / 4326 ms | 3385 / 2893 / 4907 ms | 0 |
| `deepseek/deepseek-v4-flash-0731` | Sail Research (5/5) | 16638 / 11036 / 40144 ms | 18184 / 12268 / 40655 ms | 0 |

## Provider breakdown

`deepseek/deepseek-v4-pro-0813` was not served by one stable backend during this run:

- DeepSeek, 4 repetitions: first visible text 2775 / 2268 / 4035 ms; total 3005 / 2619 / 4165 ms.
- GMICloud, 1 repetition: first visible text 4326 ms; total 4907 ms.

`deepseek/deepseek-v4-flash-0731` was served by Sail Research in all five repetitions. The first repetition was a major outlier: visible text at 40144 ms and completion at 40655 ms. That single event drives the p95 and materially inflates the average.

Gemini was consistently reported as `Google` in this sample. OpenRouter exposes multiple Google endpoint variants for the model, but the stream metadata used here reported the provider name and did not expose a more specific endpoint tag.

All 15 requests returned HTTP 200 and completed without a request error. This was a default-routing probe, not a provider-pinned comparison; therefore the DeepSeek Pro aggregate is not a single-provider latency measurement.

