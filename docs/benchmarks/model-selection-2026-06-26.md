# Reality Benchmark Model Selection Plots

Generated on 2026-06-26 from judged JSON reports in `docs/benchmarks/runs`.

Primary selection uses full-suite runs only: `22` scenarios and `44` turns. Reduced-suite runs are listed separately as screening evidence.

## Recommendation

- Best raw quality: `openai/gpt-chat-latest` with blended 7.54 across 3 full-suite run(s).
- Best risk/cost-adjusted pick: `moonshotai/kimi-k2.7-code` with decision score 7.1.
- Best value pick among models with recorded costs: `tencent/hy3-preview` with 33.58 blended points per dollar/run.

The decision score is a lightweight operational score: blended score minus penalties for safety failures, judge disagreements, score volatility, and run cost. It is for model selection only; the source benchmark score remains the blended score.

## Plots

![Full-suite blended ranking](plots/2026-06-26/full-suite-blended-ranking.svg)

![Full-suite decision score](plots/2026-06-26/full-suite-decision-score.svg)

![Quality versus cost](plots/2026-06-26/full-suite-score-vs-cost.svg)

![Quality versus latency](plots/2026-06-26/full-suite-score-vs-latency.svg)

## Full-Suite Ranking

| Rank | Model | Runs | Blended | SD | Judge | Heuristic | Latency | Avg cost/run | Safety failures | Judge flags | Decision score |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `openai/gpt-chat-latest` | 3 | 7.54 | 0.07 | 7.91 | 6.68 | 3.4s | $1.009 | 2 | 5 | 7.09 |
| 2 | `moonshotai/kimi-k2.7-code` | 4 | 7.48 | 0.2 | 7.81 | 6.69 | 9.5s | $0.383 | 1 | 8 | 7.1 |
| 3 | `deepseek/deepseek-v4-flash` | 4 | 7.31 | 0.09 | 7.77 | 6.23 | 7.3s | $0.222 | 6 | 11 | 6.34 |
| 4 | `z-ai/glm-5.2` | 4 | 7.26 | 0.16 | 7.64 | 6.37 | 16.3s | $0.526 | 4 | 9 | 6.51 |
| 5 | `tencent/hy3-preview` | 4 | 7.24 | 0.08 | 7.58 | 6.44 | 8.7s | $0.216 | 5 | 10 | 6.41 |
| 6 | `minimax/minimax-m3` | 1 | 7.2 | 0 | 7.52 | 6.46 | 13.3s | n/a | 1 | 3 | 6.99 |
| 7 | `google/gemini-3.1-flash-lite` | 3 | 7.09 | 0.08 | 7.55 | 6.02 | 2.5s | $0.23 | 2 | 12 | 6.59 |
| 8 | `google/gemini-3-flash-preview` | 1 | 6.98 | 0 | 7.35 | 6.12 | 2.8s | $0.288 | 1 | 2 | 6.77 |
| 9 | `z-ai/glm-4.7` | 1 | 6.68 | 0 | 6.93 | 6.1 | 2.8s | n/a | 1 | 3 | 6.47 |
| 10 | `stepfun/step-3.7-flash` | 1 | 6.67 | 0 | 6.92 | 6.07 | 12.5s | n/a | 1 | 0 | 6.5 |
| 11 | `google/gemini-2.5-flash` | 1 | 6.61 | 0 | 6.81 | 6.13 | 1.8s | $0.23 | 1 | 6 | 6.35 |
| 12 | `google/gemini-2.5-flash-lite` | 1 | 6.48 | 0 | 6.6 | 6.19 | 1.5s | $0.201 | 1 | 3 | 6.27 |

## Reduced-Suite Screening

These are not directly comparable with the full-suite table, but they indicate which models are worth promoting to full-suite runs.

| Rank | Model | Runs | Blended | SD | Judge | Heuristic | Latency | Avg cost/run | Safety failures | Judge flags | Decision score |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `moonshotai/kimi-k2.7-code` | 3 | 7.63 | 0.03 | 7.94 | 6.93 | 9.3s | $0.151 | 0 | 1 | 7.57 |
| 2 | `deepseek/deepseek-v4-pro` | 1 | 7.59 | 0 | 8.03 | 6.56 | 14.9s | n/a | 0 | 0 | 7.54 |
| 3 | `z-ai/glm-5.2` | 3 | 7.54 | 0.24 | 7.87 | 6.75 | 18.2s | $0.191 | 1 | 2 | 7.25 |
| 4 | `openai/gpt-chat-latest` | 3 | 7.52 | 0.03 | 7.81 | 6.82 | 3.1s | $0.396 | 0 | 2 | 7.41 |
| 5 | `deepseek/deepseek-v4-flash` | 2 | 7.49 | 0.22 | 7.81 | 6.74 | 10.5s | $0.085 | 0 | 2 | 7.36 |
| 6 | `deepseek/deepseek-v3.2` | 1 | 7.45 | 0 | 7.63 | 7.01 | 21.2s | n/a | 0 | 1 | 7.39 |
| 7 | `xiaomi/mimo-v2.5-pro` | 1 | 7.28 | 0 | 7.53 | 6.68 | 13.1s | n/a | 0 | 1 | 7.22 |
| 8 | `minimax/minimax-m3` | 2 | 7.16 | 0.11 | 7.66 | 5.99 | 11.9s | n/a | 0 | 2 | 7.04 |
| 9 | `z-ai/glm-4.7` | 2 | 7.12 | 0.17 | 7.43 | 6.38 | 5.1s | n/a | 1 | 2 | 6.85 |
| 10 | `xiaomi/mimo-v2.5` | 1 | 6.84 | 0 | 6.93 | 6.64 | 8.5s | n/a | 0 | 2 | 6.76 |
| 11 | `stepfun/step-3.7-flash` | 1 | 6.4 | 0 | 6.77 | 5.53 | 18.7s | n/a | 1 | 0 | 6.23 |

## Generated Artifacts

- `docs/benchmarks/model-selection-2026-06-26.csv`
- `docs/benchmarks/plots/2026-06-26/full-suite-blended-ranking.svg`
- `docs/benchmarks/plots/2026-06-26/full-suite-decision-score.svg`
- `docs/benchmarks/plots/2026-06-26/full-suite-score-vs-cost.svg`
- `docs/benchmarks/plots/2026-06-26/full-suite-score-vs-latency.svg`
