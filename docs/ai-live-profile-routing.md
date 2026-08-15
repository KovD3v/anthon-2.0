# Live AI execution

Live chat uses one authenticated execution path. The old `light` and
`standard` profiles, request-time classifier, fast path, allowlist, and
profile escalation have been removed because the classification round trip
often cost more than the work it was meant to optimize.

## Decision flow

```text
incoming turn
    |
    v
deterministic authentication, entitlement, safety, and capability guards
    |
    v
one normal agentic model generation
    |
    +--> model chooses zero, one, or several authorized tools
         (web, RAG, memory, user context, recall, routine)
```

The server decides which capabilities may be exposed. The model decides at
generation time whether an exposed tool is useful. Tool schemas, ownership,
approval, exact-target, idempotency, rate-limit, and persistence checks remain
authoritative and cannot be bypassed by the model.

There is no live LLM classifier. `src/lib/ai/turn-arbitration.ts` creates only
the immutable capability decision, and `src/lib/ai/turn-plan.ts` creates a
`full` authenticated plan or a `guest` plan. A short answer is an output
length instruction, not a different execution profile.

## Tool selection

For an authenticated turn, the normal model receives the server-authorized
inventory. It may use no tools, one tool, or multiple tools in one response:

- web search/fetch for current external information;
- RAG for the user's uploaded documents;
- memory and user-context tools for authorized persistent information;
- conversation recall when the recall release permits it;
- routine proposal when the feature and request are eligible.

Guest sessions retain the guest prompt and no persistent memory access. Direct
media and voice are input/output modes, not execution profiles.

## Configuration

The profile configuration variables were removed. There is no fast-path
kill switch, classifier switch, task allowlist, percentage rollout, or admin
profile selector. The live capability planner is always `agentic`; this is a
code invariant rather than an environment rollout.

The existing provider/model environment variables still control OpenRouter
provider routing and model availability. They do not select a light or
standard execution bundle.

## Metrics and historical data

Current response-profiler traces report the actual model attempt, provider,
generation TTFT, total request timing, tool timing, RAG usage, memory recall,
and capability usage. They do not create `classification`, `light`, or
`standard` spans and do not emit `classificationLatencyMs`.

`MessageMetrics.executionRoute` and old route-shaped JSON are retained only as
nullable historical compatibility data. New turns never write them, and the
profiler does not render them as a live routing phase. Recovery and comparison
code reads old records only to discard the obsolete execution-profile fields.

## Verification

The current contract is covered by:

```bash
bunx vitest run \
  src/lib/ai/turn-arbitration.test.ts \
  src/lib/ai/turn-plan.test.ts \
  src/lib/ai/turn-decision-metadata.test.ts \
  src/lib/ai/orchestrator.test.ts \
  src/lib/channel-flow/run.test.ts
```

The old turn-routing evaluation and profile-specific test modules were
removed. Model comparisons remain available for explicit model evaluation,
but both variants use the same capability-only prepared context and do not
reintroduce live routing profiles.
