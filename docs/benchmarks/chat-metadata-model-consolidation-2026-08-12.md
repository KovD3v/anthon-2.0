# Chat metadata model mini-eval

Generated from Italy on 2026-08-12T17:06:47.278Z. Each exact candidate received 24 attempts over the same 12 curated Italian scenarios.

| Model | Valid | Title | Icon | p50 ms | p95 ms | Cost | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `deepseek/deepseek-v4-flash` | 23/24 | 0.935 | 0.957 | 1040 | 1870 | $0.001578 | 0.809 |
| `nvidia/nemotron-3.5-lightning` | 21/24 | 0.869 | 0.881 | 485 | 751 | $0.000455 | 0.312 |
| `deepseek/deepseek-v4-flash-0731` | 20/24 | 0.838 | 1.000 | 937 | 1850 | $0.000478 | 0.292 |

## Decision

Selected `deepseek/deepseek-v4-flash`.

Retained the incumbent because no challenger cleared the structured-output reliability gate (nvidia/nemotron-3.5-lightning 21/24; deepseek/deepseek-v4-flash-0731 20/24).

## Availability

- `deepseek/deepseek-v4-flash`: 1/24 failures — No object generated: response did not match schema.
- `deepseek/deepseek-v4-flash-0731`: 4/24 failures — No object generated: response did not match schema.
- `nvidia/nemotron-3.5-lightning`: 3/24 failures — No object generated: response did not match schema.

No blinded semantic review is required for promotion when every challenger fails the structured-output reliability gate.

## Method

Structured-output reliability is a gate: a challenger needs 24/24 valid outputs before it can replace the incumbent. Candidates are then ranked by title quality (50%), icon fit (25%), reliability (15%), Italy end-to-end latency (7%), and cost (3%). Provider failures and exact model IDs are preserved; no alias or fallback substitution is allowed.
