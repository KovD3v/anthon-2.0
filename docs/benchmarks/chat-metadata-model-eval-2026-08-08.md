# Chat metadata model mini-eval

Generated from Italy on 2026-08-08T19:34:30.761Z. Each exact candidate received 24 attempts over the same 12 curated Italian scenarios.

| Model | Valid | Title | Icon | p50 ms | p95 ms | Cost | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `deepseek/deepseek-v4-flash` | 24/24 | 0.917 | 0.921 | 738 | 1236 | $0.001360 | 1.000 |
| `inclusionai/ling-3.0-flash` | 0/24 | 0.000 | 0.000 | - | - | $0.000000 | 0.000 |
| `qwen/qwen3.7-flash` | 0/24 | 0.000 | 0.000 | - | - | $0.000000 | 0.000 |

## Decision

Selected `deepseek/deepseek-v4-flash`.

deepseek/deepseek-v4-flash was the only eligible candidate: 24/24 valid outputs, blinded title score 0.9167, icon score 0.9208, p50 738 ms, and $0.00136024 total cost.

## Availability

- `inclusionai/ling-3.0-flash`: 24/24 failures — No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection
- `qwen/qwen3.7-flash`: 24/24 failures — No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection
- `deepseek/deepseek-v4-flash`: 24/24 valid structured outputs.

The blinded review found strong title specificity overall. The main weaknesses were omission of the coach in the coach-conversation scenario, one unsupported urgency word in a vague opening, and inconsistent icon choice for pre-final pressure.

## Method

Structured-output reliability is a gate. Eligible models are ranked by title quality (50%), icon fit (25%), reliability (15%), Italy end-to-end latency (7%), and cost (3%). Provider failures and exact model IDs are preserved; no alias or fallback substitution is allowed.
