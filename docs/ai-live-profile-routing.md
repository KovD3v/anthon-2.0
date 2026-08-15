# Live AI Profile Routing

This document describes the current profile-routing policy for Web, Telegram,
and WhatsApp chat requests.

## Decision

Live chat does not run an LLM classifier before selecting the `light` or
`standard` execution profile. The request-time classifier added measurable
latency to every classified turn, including turns that eventually used the
standard model, and its rollout/allowlist configuration added operational
complexity without improving the safety boundary enough to justify it.

The live path now has two outcomes:

1. A small deterministic fast path may select `light` for an obviously
   self-contained turn.
2. Every other turn selects `standard`.

The standard model is unchanged. When `AI_CAPABILITY_PLANNER_MODE=agentic`, it
decides whether to use none, one, or several of the permitted web, RAG,
memory, recall, user-context, and routine tools. Server-side capability guards
remain authoritative: the model can choose only among tools exposed for that
turn, and mutations still require their existing ownership, approval,
idempotency, and exact-target checks.

## Live decision flow

```text
incoming turn
    |
    v
deterministic capability and safety guards
    |
    +-- safe social/self-contained transform + fast path enabled --> light
    |
    +-- everything else -------------------------------------------> standard
                                                                        |
                                                                        v
                                                   agentic tool selection,
                                                   when enabled
```

The fast path is implemented in `src/lib/ai/fast-routing.ts` and is applied
by `src/lib/ai/turn-arbitration.ts`. It is a code-level safety policy, not a
remotely learned or admin-managed allowlist.

## Routing policy

| Input shape | Live result | Reason |
| --- | --- | --- |
| Exact lightweight social turn such as a greeting | `light` eligible | No external knowledge, context, or side effect is needed |
| Self-contained rewrite, translation, formatting, extraction, or supplied-text summary | `light` eligible | The source text is in the request and the operation is bounded |
| Ambiguous or context-dependent request | `standard` | The deterministic rules cannot safely prove that `light` is sufficient |
| Coaching, planning, memory, profile, preference, or notes request | `standard` | The turn needs context, reasoning, or a guarded capability |
| Web, RAG, current-information, media, voice, or approval request | `standard` | Tools or richer execution are required |
| Long input, long output, embedded instructions, or unresolved context | `standard` | A safety or budget veto applies |
| Any input with `AI_FAST_PATH_ENABLED=false` | `standard` | The kill switch disables the fast path |

The static light-task boundary is limited to `social`, `rewrite`, `translate`,
`format`, `extract`, and `summarize_supplied`. A light execution receives no
tools, uses the compact prompt, and has bounded output. If the light provider
fails before streaming or returns an empty response, the existing fallback
escalates to `standard`.

## Configuration

```dotenv
# Default: enabled. Set to false to force standard execution.
AI_FAST_PATH_ENABLED="true"

# Required for model-selected optional tools on standard turns.
AI_CAPABILITY_PLANNER_MODE="agentic"
```

`AI_FAST_PATH_ENABLED` is the only live profile-routing switch. Unset or
`true` enables the deterministic fast path. `false` disables it; invalid
values also fail closed to standard execution. The old percentage, task-list,
shadow-mode, and database-backed classifier settings are no longer read.

`AI_CAPABILITY_PLANNER_MODE` controls tool selection, not profile selection:

- `agentic`: the standard model selects among the permitted optional tools.
- `legacy`: compatibility behavior remains in place; legacy RAG prefetch may
  still use its separate bounded RAG classifier for uncertain retrieval cases.

That RAG classifier is not the profile classifier and is not entered by the
normal agentic live path. The profile-classifier implementation is retained
only for explicit cold evaluation and compatibility code paths.

## Observability

Current live execution traces record:

- eligible, planned, and executed profile;
- deterministic reason codes and task kind;
- routing overhead;
- per-attempt generation TTFT, total request TTFT, and escalation;
- model/provider and tool timing for the actual generation.

Current traces do not populate classifier latency, classifier model, or
classifier provider. The parser and profiler retain optional support for old
persisted traces so historical metrics remain readable without presenting a
classifier phase for deterministic routing.

Use the explicit cold evaluation when classifier quality needs to be measured:

```bash
bun run eval:turn-routing
```

This evaluation is not part of a chat request and requires its own provider
credentials. It must not be interpreted as evidence that live profile routing
still calls the classifier.

## Administration and migration

There is no classifier page, editable allowlist, percentage rollout, or
`AiRoutingConfig` runtime control plane. Changes to the fast-path boundary are
code changes protected by tests and the single environment kill switch.

The removal migration is:

```text
prisma/migrations/20260815130000_remove_ai_routing_config/migration.sql
```

It drops the retired `AiRoutingConfig` table. Before applying it to a shared
database, resolve any Prisma migration-history drift and verify the intended
environment. The application no longer reads or writes that table, so the
code change and the database migration can be deployed as separate, verified
steps.

## Verification

The routing contract is covered by tests for:

- deterministic social and self-contained-transform light eligibility;
- standard fallback for ambiguous, contextual, tool, coaching, and media
  turns;
- the fast-path kill switch;
- the absence of a live remote-classifier call;
- channel parity across Web, Telegram, and WhatsApp;
- historical trace compatibility and omission of current classifier fields.

Relevant commands:

```bash
bunx vitest run src/lib/ai/turn-arbitration.test.ts \
  src/lib/ai/execution-routing.test.ts \
  src/lib/ai/fast-path-config.test.ts
bun run test
```
