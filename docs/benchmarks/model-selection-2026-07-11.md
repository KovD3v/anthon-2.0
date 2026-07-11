# Model selection follow-up — 2026-07-11

## Decision order

Candidates are evaluated lexicographically in this order:

1. End-to-end latency for users in Italy.
2. Cost.
3. Capability for the intended application role.
4. Output throughput in tokens per second.

All four dimensions remain required. A candidate that fails availability or the
interactive-latency gate is not promoted solely because it is cheap or capable.

## Italy full-suite run

The DB-backed reality suite ran from Italy against OpenRouter's standard routing
on 22 scenarios and 44 turns per model. The raw artifacts are:

- `docs/benchmarks/runs/reality-2026-07-11-luna-laguna-italy.json`
- `docs/benchmarks/runs/reality-2026-07-11-luna-laguna-italy.md`

| Model | Avg E2E latency | Total run cost | Heuristic score | Effective output tok/s |
|---|---:|---:|---:|---:|
| `openai/gpt-5.6-luna` | 3.429s | $0.094624 | 6.40 | 67.1 |
| `poolside/laguna-xs-2.1` | 10.432s | $0.011281 | 5.70 | 147.5 |

Effective output tok/s is `outputTokens / generationTimeMs` averaged across 43
successful measured turns. It is an application-level measure and includes
model/tool-loop effects; it is not the provider's raw decoder throughput.

### Role assessment

- `openai/gpt-5.6-luna`: viable orchestrator/chat candidate. It won on the
  primary latency criterion and on coaching capability, but is substantially
  more expensive than Laguna.
- `poolside/laguna-xs-2.1`: not an orchestrator candidate for this product. It
  is inexpensive and has high raw/effective throughput, but its long-tail
  generation behavior produced worse E2E latency and lower coaching quality.
  Its coding specialization may still justify a separate coding-agent test,
  which is outside Anthon's current production roles.

## Gated candidates

### `tencent/hy3`

The live Italy run was stopped after repeated slow turns because it had already
failed the primary interactive-latency gate. OpenRouter's current standard
endpoint also reports approximately 108.25s latency and 2 tok/s. It remains
cheap at $0.14/M input and $0.58/M output, but is not suitable for orchestrator,
sub-agent, or synchronous maintenance work under the current provider.

### `x-ai/grok-4.5`

Requests from Italy returned HTTP 403 with `The model grok-4.5 is not available
in your region.` No zero-latency/zero-cost rows are treated as benchmark data.

Regional fallback measurement order:

1. Milan/Italy.
2. Frankfurt, to verify the closest practical region even though the current
   restriction appears EU-wide.
3. Zurich, if an execution point is available.
4. London as the closest practical non-EU measurement point.

The eventual Grok result must report both execution-region latency and the
Italy-to-region network leg; it must not be presented as a direct Italy result.

## Current recommendation

- Keep `z-ai/glm-5.2` as production orchestrator until Luna is compared against
  it in a controlled same-window rerun and receives complete judge scoring.
- Promote Luna to that head-to-head rerun.
- Do not promote Laguna or Hy3 to any current application role.
- Keep Grok pending the nearest-region availability run.

## Known harness issue

The reality runner currently converts all-turn execution failures into a
plausible-looking score with zero latency and zero cost, and exits successfully.
Those outputs were discarded. Future benchmark work should make the runner fail
when a model has no successful measured turns.
