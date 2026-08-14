# Direct OpenRouter Latency Probe

- Run label: `latency-2026-08-14-openrouter-direct-benchmark-key`
- Authentication: separate `OPENROUTER_API_KEY` from `.env.benchmark`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Request: streaming, `max_tokens=1024`, one fixed short Italian prompt
- Repetitions: 5 per model, sequentially, no concurrency

This measures provider/API latency only. It does not include Anthon routing, classification, RAG, database writes, persistence, or the longer reality-benchmark context.

| Model | Headers avg | First visible text avg / p50 / p95 | Total avg / p50 / p95 | Errors |
| --- | ---: | ---: | ---: | ---: |
| `google/gemini-3.7-flash` | 1555 ms | 3119 / 3048 / 3420 ms | 3299 / 3299 / 3588 ms | 0 |
| `x-ai/grok-4.6` | 434 ms | 9059 / 9832 / 11638 ms | 9305 / 10096 / 11869 ms | 0 |
| `deepseek/deepseek-v4-pro-0813` | 387 ms | 2224 / 2001 / 2785 ms | 2414 / 2218 / 3051 ms | 0 |
| `deepseek/deepseek-v4-flash-0731` | 1172 ms | 5382 / 2709 / 13666 ms | 7098 / 5499 / 16509 ms | 0 |
| `meta/muse-spark-1.2` | 712 ms | 4784 / 4551 / 6197 ms | 4996 / 4684 / 6386 ms | 0 |

## Interpretation

The direct provider timings are materially lower than the full reality benchmark timings. The largest gaps are for Grok 4.6, DeepSeek V4 Pro 0813, and Muse Spark 1.2, which indicates that their reality-benchmark latency is not explained by provider generation time alone; Anthon-side orchestration, context, persistence, and streaming lifecycle contribute materially.
