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
- Xiaomi MiMo V2.5 follow-up run: `cmpx2r5xb0000jk0l93xkgbrx`
- DeepSeek V4 Flash follow-up run: `cmpxyhsb60000kb0l1pty8foi`

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
| 9 | `deepseek/deepseek-v4-flash` | 6.45 | 7.58 | 5.83 | 8.25s | 4.63s | $0.0053 | 95.8% | Very cheap and strong tool score, but weaker writing and one failed/zero-score case. |
| 10 | `xiaomi/mimo-v2.5` | 6.42 | 6.67 | 6.50 | 9.45s | 6.08s | $0.0088 | 100.0% | Audio-capable and very cheap, but weaker on this dataset. |

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
- Consider `xiaomi/mimo-v2.5` only if direct audio input becomes more important
  than benchmark quality. It supports audio, image, and video input on
  OpenRouter, but scored below the current default and the main alternatives.
- Use `minimax/minimax-m2.5` for tool-heavy flows where tool-call behavior is
  more important than writing polish.
- Keep `minimax/minimax-m3` as a candidate for follow-up testing. It is more
  balanced than M2.5, but the latency profile is too slow for the default chat
  path in this run.
- Consider `deepseek/deepseek-v4-flash` only for low-cost tool-heavy
  experiments. It produced a strong tool score and the lowest total cost in the
  recorded set, but the writing score, variance, and one zero-score case make it
  unsuitable as the default chat model.

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

### `xiaomi/mimo-v2.5`

- Run ID: `cmpx2r5xb0000jk0l93xkgbrx`
- Test count: 24
- Average score: 6.4167
- Judge 1 average: 6.5833
- Judge 2 average: 6.2500
- Consensus average: 6.4167
- Flagged for review: 0
- Average inference time: 9445.54 ms
- Average TTFT: 6078.45 ms
- Average request cost: $0.000368
- Total cost: $0.008827
- Tool usage score: 6.6667
- Writing quality score: 6.5000
- Reliability: 1.0000
- Variance: 1.7834
- Total input tokens: 48432
- Total output tokens: 7309
- OpenRouter modalities: text, audio, image, video input; text output

### `deepseek/deepseek-v4-flash`

- Run ID: `cmpxyhsb60000kb0l1pty8foi`
- Test count: 24
- Average score: 6.4479
- Judge 1 average: 6.7083
- Judge 2 average: 6.1875
- Consensus average: 6.4479
- Flagged for review: 1
- Average inference time: 8249.38 ms
- Average TTFT: 4631.91 ms
- Average request cost: $0.000219
- Total cost: $0.005256
- Tool usage score: 7.5833
- Writing quality score: 5.8333
- Reliability: 0.9583
- Variance: 2.1626
- Reasoning efficiency: 0.3369
- Token efficiency index: 2.5089
- Total input tokens: 39137
- Total output tokens: 7166
