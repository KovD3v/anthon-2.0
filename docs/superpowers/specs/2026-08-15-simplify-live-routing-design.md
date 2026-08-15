# Simplify Live AI Routing

## Goal

Remove request-time LLM classification and the configurable category rollout
system from chat routing. Keep only a small deterministic fast path for
obviously self-contained turns; send every other turn to the standard model,
which remains responsible for agentic tool selection.

## Design

- `arbitrateTurn` never calls `classifyTurn` during a live request. It uses the
  existing deterministic rules and falls back to a standard decision when no
  safe rule matches.
- The fast path is controlled by one environment kill switch,
  `AI_FAST_PATH_ENABLED`. It defaults to enabled; the exact value `false`
  disables it. There is no DB-backed routing configuration, task allowlist,
  shadow mode, percentage allocation, or live classifier switch.
- The existing static safety rules remain the closed implementation boundary:
  greetings, simple social turns, and self-contained transformations can be
  eligible for light execution. This is code policy, not a remotely learned
  allowlist.
- Agentic standard turns retain the current model-selected web, RAG, memory,
  and other tool behavior. The simplification must not change those tool
  permissions or the standard prompt.
- Runtime metrics retain profile, attempt, TTFT, provider, and tool timing
  data. Classifier latency/model/provider are no longer populated by live
  chat, and the profiler does not present a classifier phase for deterministic
  routing. Historical trace parsing remains backward-compatible where practical.

## Removal scope

- Delete the admin classifier page and route, its navigation entry, the
  `AiRoutingConfig` Prisma model, and the persistence store.
- Replace rollout-specific execution selection with a direct fast-path-enabled
  decision and a standard fallback.
- Keep `turn-classification.ts` only for explicit offline/cold evaluation
  scripts; it is not imported by the live arbitration path.
- Update environment examples and AI routing documentation to describe the
  single kill switch.

## Verification

- A live agentic turn with an ambiguous message and a classifier spy never
  invokes the spy and reports zero classification latency.
- A deterministic social or self-contained transformation can plan light when
  the fast path is enabled, and plans standard when disabled.
- A non-deterministic or tool-requiring turn plans standard and leaves the
  standard agentic tool-selection path intact.
- Targeted AI tests, the full unit suite, typecheck, build, and the running
  Next.js development runtime pass without new errors.
