# Model Selection Benchmark - 2026-06-02

## Scope

This report records the model-selection benchmark for Anthon 2.0 chat quality,
tool usage, memory/profile handling, and coaching response quality.

Dataset:

- Version: benchmark dataset v2
- Active test cases: 24
- Categories: 12 tool usage, 12 writing quality
- Judges: `x-ai/grok-4.3` and `google/gemini-3.5-flash`

Runs:

- Main comparison run: `cmpwu6s38000ob00lg4roh7pl`
- MiniMax M3 follow-up run: `cmpwvaytv0000980li7zlb2qi`

## Updated Ranking

| Rank | Model | Avg score | Tool score | Writing score | Avg latency | Avg TTFT | Total cost | Reliability | Notes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `openai/gpt-chat-latest` | 7.00 | 7.17 | 7.33 | 3.55s | 1.94s | $0.2691 | 100.0% | Best overall score. |
| 2 | `minimax/minimax-m2.5` | 6.96 | 8.33 | 6.42 | 4.10s | 3.93s | $0.0143 | 100.0% | Best tool-usage score. |
| 3 | `minimax/minimax-m3` | 6.90 | 7.17 | 7.17 | 16.60s | 8.08s | $0.0240 | 100.0% | Better balanced than M2.5, but much slower. |
| 4 | `google/gemini-3.1-flash-lite` | 6.77 | 7.17 | 6.83 | 1.95s | 1.26s | $0.0126 | 100.0% | Best latency/cost profile. |
| 5 | `openai/gpt-5.5` | 6.71 | 6.92 | 6.92 | 10.31s | 5.58s | $0.3122 | 100.0% | Solid quality, but expensive and slower. |
| 6 | `qwen/qwen3.6-plus` | 6.60 | 7.33 | 6.58 | 24.32s | 20.45s | $0.0494 | 100.0% | Too slow for default chat. |
| 7 | `x-ai/grok-4.3` | 6.58 | 6.50 | 7.58 | 5.72s | 4.72s | $0.0682 | 100.0% | Strongest writing score, weaker tool score. |
| 8 | `z-ai/glm-5.1` | 6.50 | 6.83 | 6.17 | 12.24s | 6.28s | $0.0552 | 100.0% | Not competitive enough. |

## Recorded But Excluded From Selection

`openai/gpt-5.5-pro` was included in the first full run by mistake and should
not be considered part of the intended candidate set. It is recorded here only
for auditability.

| Model | Avg score | Tool score | Writing score | Avg latency | Avg TTFT | Total cost | Reliability | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `openai/gpt-5.5-pro` | 6.06 | 6.42 | 5.83 | 54.61s | 62.18s | $2.5241 | 91.7% | Had three OpenRouter 402 failures and is not viable as a default. |

## Decision

Selected default for the product:

- `openai/gpt-chat-latest`

Reasoning:

- It had the best overall benchmark score.
- It had strong writing quality while keeping latency acceptable for chat.
- It is more expensive than the fastest low-cost candidates, so cost should be
  monitored after rollout.

Recommended alternatives:

- Use `google/gemini-3.1-flash-lite` when latency and cost matter more than
  maximum quality.
- Use `minimax/minimax-m2.5` for tool-heavy flows where tool-call behavior is
  more important than writing polish.
- Keep `minimax/minimax-m3` as a candidate for follow-up testing. It is more
  balanced than M2.5, but the latency profile is too slow for the default chat
  path in this run.

## Raw Aggregates

### `minimax/minimax-m3`

- Run ID: `cmpwvaytv0000980li7zlb2qi`
- Test count: 24
- Average score: 6.8958
- Judge 1 average: 7.1667
- Judge 2 average: 6.6250
- Consensus average: 6.8958
- Flagged for review: 0
- Average inference time: 16596.21 ms
- Average TTFT: 8077.25 ms
- Average request cost: $0.001000
- Total cost: $0.024003
- Tool usage score: 7.1667
- Writing quality score: 7.1667
- Reliability: 1.0000
- Variance: 1.7499
- Total input tokens: 45599
- Total output tokens: 8603
