# Italy model benchmark — 2026-07-30

## Decision order

The comparison follows the product's established lexicographic order:

1. End-to-end latency for users in Italy.
2. Cost.
3. Capability for Anthon's coaching/orchestrator role.
4. Effective output throughput.

Availability is a gate. A model with frequent failed turns is not promoted
because its successful requests are inexpensive or fast.

## Candidates and routing

| Candidate | OpenRouter model ID | Routing condition |
| --- | --- | --- |
| GPT-5.6 Luna | `openai/gpt-5.6-luna` | OpenAI priority endpoint only; fallbacks disabled |
| GLM-5.2 | `z-ai/glm-5.2` | Standard routing, sorted by latency |
| Laguna S 2.1 | `poolside/laguna-s-2.1` | Standard routing, single Poolside provider |
| Gemini 3.5 Flash Lite | `google/gemini-3.5-flash-lite` | Standard routing, sorted by latency |

For Luna, the benchmark used OpenRouter's `openai/priority` endpoint tag with
`allow_fallbacks: false`. This is the strict endpoint form of OpenRouter's
priority service-tier selection and prevents a standard-tier fallback. The
current OpenRouter AI SDK metadata exposes the selected provider as OpenAI but
does not surface the upstream `service_tier` response field in the saved run.

## Method

- Execution location: local client network in Italy.
- Workload: the DB-backed reality suite with 22 scenarios and 44 turns per
  candidate.
- Runtime behavior: the real authenticated chat orchestration path, including
  applicable prompt planning and tool loops.
- Candidate concurrency: Luna ran alone because it required different routing;
  the three standard-routing candidates ran concurrently in the immediately
  following window.
- Scoring in this report: existing deterministic reality-suite heuristic.
- Latency: application-level generation time, including multi-step model/tool
  loops where used. It is not provider TTFT.
- Effective tok/s: total successful output tokens divided by total successful
  generation time. It is not raw decoder throughput.
- Cost: OpenRouter usage cost, with the existing cost-calculator fallback where
  needed.
- No independent LLM-as-a-judge scores were collected in this run.

Raw artifacts:

- `docs/benchmarks/runs/reality-2026-07-30-luna-openai-priority-italy.json`
- `docs/benchmarks/runs/reality-2026-07-30-luna-openai-priority-italy.md`
- `docs/benchmarks/runs/reality-2026-07-30-glm-laguna-s-gemini-lite-italy.json`
- `docs/benchmarks/runs/reality-2026-07-30-glm-laguna-s-gemini-lite-italy.md`

## Success-filtered results

Empty responses and zero-duration turns are failures and are excluded from
latency, quality, cost, and throughput aggregates below.

| Model | Successful turns | Reliability | Heuristic score | Avg E2E | p50 | p95 | p99 | Successful-turn cost | Effective tok/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.5-flash-lite` | 44/44 | 100.0% | 5.86 | 1.410s | 1.388s | 1.920s | 2.098s | $0.026063 | 97.1 |
| `openai/gpt-5.6-luna` priority | 44/44 | 100.0% | 6.26 | 3.763s | 3.150s | 7.075s | 9.652s | $0.019082 | 59.5 |
| `z-ai/glm-5.2` | 43/44 | 97.7% | 6.77 | 4.306s | 2.898s | 14.048s | 21.636s | $0.078845 | 61.6 |
| `poolside/laguna-s-2.1` | 28/44 | 63.6% | 5.75 | 5.747s | 5.288s | 11.235s | 12.305s | $0.002113 | 31.1 |

The raw generated report shows GLM at 7.036s average because one failed,
empty turn retained a 124.404s duration. The success-filtered comparison treats
that turn as a reliability failure instead of a latency sample.

## Interpretation

### Gemini 3.5 Flash Lite

Gemini is the decisive latency winner. It completed every turn, had a 1.410s
average and 2.098s p99, and delivered the highest effective throughput. Its
heuristic coaching score was 0.91 below GLM and 0.40 below Luna, so the result
supports it most strongly for latency-critical classifiers, sub-agents, and
brief interactions rather than an automatic orchestrator replacement.

### GPT-5.6 Luna on OpenAI priority

Luna is the strongest latency/quality compromise in this run. It was fully
reliable, scored 0.51 below GLM, cost about one quarter as much as GLM, and
improved average latency by approximately 13%. Its tail was materially better:
7.075s p95 versus GLM's 14.048s and 9.652s p99 versus 21.636s.

Luna should advance to independent judge scoring before replacing GLM. A
standard-tier Luna control run would also be needed to quantify the incremental
benefit and cost of priority service rather than attributing all improvement to
the service tier.

### GLM-5.2

GLM retained the best heuristic coaching score at 6.77. It also had the lowest
successful-turn p50 among the three stronger coaching candidates, narrowly
ahead of Luna. Its weaknesses were cost and tail latency: it was the most
expensive candidate and had a much wider p95/p99 distribution. One of 44 turns
failed.

### Laguna S 2.1

Laguna S did not validate the expected low application-level latency. Sixteen
turns failed after OpenRouter retries because Poolside's shared upstream pool
returned HTTP 429. Among successful turns, it averaged 5.747s and scored 5.75.
It was by far the cheapest model, but the 63.6% completion rate disqualifies it
for the synchronous production path under the tested provider conditions.

This does not contradict a low provider TTFT measurement: Anthon's E2E metric
includes complete generation and tool-loop behavior, while advertised provider
latency may measure only time to first token.

## Current recommendation

- Keep GLM-5.2 as the quality baseline until independent judge scoring is
  complete.
- Promote Luna priority to the final judged head-to-head against GLM. It is the
  leading orchestrator challenger on latency, cost, and reliability.
- Evaluate Gemini 3.5 Flash Lite for latency-sensitive non-orchestrator roles,
  and include it in judging if a lower-quality but much faster orchestrator mode
  is acceptable.
- Do not promote Laguna S 2.1 while the only available provider has this
  reliability profile.

## Harness limitation discovered

The DB-backed executor can turn a streaming provider failure into an empty
assistant response with zero metrics without setting `benchmarkError`. The
existing report then scores the empty response and counts it as a completed
turn. This affected Laguna heavily and GLM once. All decision figures in this
document therefore use non-empty responses with positive generation time.

The harness should be hardened before the next benchmark so empty streamed
turns are recorded as explicit failures and excluded from aggregate quality and
latency metrics automatically.
