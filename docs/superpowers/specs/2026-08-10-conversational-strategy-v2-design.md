# Conversational Strategy v2 Design

## Goal

Preserve the strong structural gains of v1 while restoring high-value discovery, context continuity, and progression. The evaluated and production model remains `openai/gpt-5.6-luna`.

## Evidence From v1

V1 reduced formulaic openings, lists, ritual final questions, response length, cost, and latency. It improved discovery before advice, naturalness, context use, and multi-turn progression without candidate safety regressions. It also reduced question quality and lost important comparisons involving identity correction, known thread facts, cross-chat continuation, and some follow-up turns.

## Considered Approaches

### A. Add more mandatory questions

Require a question whenever the user asks for coaching. This would recover question frequency but recreate the prefab pattern and reward ritual questions. Rejected.

### B. Add a hidden planner state

Introduce a new per-turn classification such as `discover`, `answer`, or `reflect`, then condition the prompt on it. This may eventually be useful, but it expands scope into planner behavior and adds another model decision before the prompt-only experiment is understood. Deferred.

### C. Prompt-level decision policy

Teach the existing model to decide whether missing information would materially change a personalized recommendation. Preserve direct answers for sufficiently specified requests, but require one high-value question before detailed prescriptions when decisive context is missing. This is the recommended v2 because it isolates the next experiment to the system prompt.

## Response Decision Policy

Before answering, Anthon should silently distinguish between three situations:

1. **Enough context:** answer directly. A question is optional and must add real reflective or diagnostic value.
2. **Material context missing:** give only safe, immediately useful framing and ask one high-value diagnostic question before a detailed plan or personalized prescription.
3. **Correction or established context:** treat the latest correction as authoritative, explicitly carry forward relevant identity and facts, and never ask for information already available.

This is a reasoning policy, not a visible template. The response must not announce the classification.

## Conversational Rules

- No mandatory acknowledgment, list, or final question.
- Do not suppress questions merely to be concise.
- Prefer one diagnostic question at a time; combine tightly related facts only when separating them would create unnecessary turns.
- A diagnostic question is justified only when different answers would produce meaningfully different advice.
- When context is incomplete, provide a small safe observation or principle rather than the full generic plan.
- Use the user's latest identity correction and relevant known facts naturally. Do not force the user's name into every response.
- Across turns, deepen the model of the user or specialize the advice. Do not recycle the same breathing, keyword, reset, or next-action routine unless the new context makes it specifically appropriate.
- Cross-chat limitations must be transparent. Once the user supplies enough missing context, continue from it without pretending to have seen inaccessible messages.

## Scope

V2 changes only the full system prompt strategy and its focused regression test. It does not change Luna, TurnPlan, capability planning, memory, RAG, database schema, UI, production allocation, or benchmark fixtures.

## Evaluation

Run the existing candidate workflow with three replicas across all ten scenarios, then perform the two-judge blind comparison against the original baseline. Review aggregate results and every scenario family.

V2 is eligible for promotion only if:

- it preserves the large reduction in prefab structural patterns;
- it has no candidate safety regression;
- question quality materially recovers from v1;
- identity, known-context, and cross-chat scenario families no longer show the pronounced v1 losses;
- overall gains are not explained solely by longer answers or more questions.

## Verification

- Add a failing prompt regression test for the three-way decision policy, identity/correction priority, and prohibition on suppressing useful questions.
- Run the complete orchestrator tests, lint, typecheck, and unit suite.
- Store candidate and comparison artifacts under `docs/benchmarks/runs/`.
- Keep all work isolated on `feat/conversational-quality-benchmark`; do not push, merge, deploy, or alter Production.
