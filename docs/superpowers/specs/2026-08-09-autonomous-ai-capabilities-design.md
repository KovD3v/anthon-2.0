# Autonomous AI Capability Selection Design

**Date:** 2026-08-09
**Status:** Proposed for implementation after user review

## Goal

Make Anthon decide autonomously, for every message, which capabilities are useful and safe to use. The decision must be composable: one turn may combine RAG, web search, persistent-memory access, a routine proposal, and automatic voice delivery. Deterministic code remains responsible for authorization, safety, plan entitlements, channel support, cost, rate, validation, and idempotence.

The user should experience a natural coaching answer. Memory side effects are silent in the answer, routine proposals are never persisted by the AI, and capability usage is represented only by non-interactive, discreet UI indicators.

## Current state and problem

The repository already has most of the required primitives, but their availability is decided too early:

- `TurnPlan` derives RAG, web, memory, and context capability flags from regex intent rules plus a limited prompt-module classifier.
- Authenticated RAG is fetched before generation and is currently disabled when web search is enabled, so the two capabilities cannot be composed.
- TinyFish, memory, user-context, and routine tools are selectively exposed from `createToolsWithContext`; the model cannot choose a capability that the pre-router did not enable.
- `proposeRoutine` is correctly non-persistent, but its availability is still largely determined by deterministic routine matchers.
- `saveMemory` exists as a tool but is intentionally not exposed in the streaming tool set. The post-generation extractor persists only explicit facts.
- Web voice already uses AI suitability classification and a deterministic delivery policy for plan, user preference, provider capacity, cadence, quota, and anti-spam limits.

The result is a capable system whose tool inventory is narrower than the model's actual coaching judgment.

## Decision and scope

### Capability decision model

Introduce a model-driven capability arbitration step that returns an allow/deny decision for each optional capability before the main generation:

```ts
type CapabilityDecision = {
  rag: boolean;
  webSearch: boolean;
  webFetch: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  memoryDelete: boolean;
  routineProposal: boolean;
  userContext: boolean;
  voiceOutput: boolean;
  reason: string;
};
```

The decision is advisory for capability selection and never bypasses server policy. Explicit user constraints remain hard constraints: “senza cercare online” denies web search; “dimentica questa cosa” authorizes a targeted memory deletion; a disabled voice preference denies voice output.

RAG and web search are independent booleans. If both are selected, both may execute within their separate budgets. A failed classifier falls back to a conservative deterministic policy rather than exposing unrestricted side effects.

### Tool and side-effect semantics

The main model receives only the capabilities allowed for the turn and may choose whether and when to call the exposed tools. Tool execution is validated again at the server boundary.

| Capability | Model behavior | Server boundary |
| --- | --- | --- |
| RAG | Select retrieval when curated material can improve the answer | Authenticated ownership/corpus policy, bounded query, one lookup budget, truthful empty-result state |
| Web search/fetch | Select current or external research and optionally read returned URLs | Search/fetch budgets, public URLs, timeout, user “no web” constraint |
| Memory read | Read persistent user memory when it improves personalization or continuity | Own-user scope, category/query bounds, no guest access |
| Memory write | Create or overwrite one durable fact, including reliable inferred facts | Own-user scope, key normalization, confidence/category validation, silent persistence |
| Memory delete | Delete one exact targeted fact for an explicit “forget” request | Explicit deletion authorization, exact key resolution, idempotent not-found result, own-user scope |
| Routine proposal | Produce at most one validated interactive proposal when useful | Proposal schema validation; never creates a `Routine` record |
| Voice | Choose audio when the response benefits from it, even without an explicit request | Existing plan, quiet-mode, provider, quota, cadence, anti-spam, and content suitability policy |

The existing voice preflight remains the delivery authority. The autonomous capability decision may express a voice preference, but it cannot force audio when the voice policy returns text or when the user has disabled voice. There is no “always voice” preference; the only persistent user override is voice disabled/quiet mode.

### Memory policy

Memory create and overwrite are one capability: `memoryWrite`. The AI may silently persist ordinary stable facts and reliable inferred preferences. It must not persist every transient detail.

Sensitive or high-impact deductions, including health, diagnosis, trauma, or intimate data, are never written directly. The AI creates a pending approval candidate and asks for approval in natural language. A natural affirmative response, such as “sì, ricordalo”, resolves that candidate and permits the write; a negative response rejects it. Ambiguous responses leave the candidate pending and receive a normal clarification request. The approval state is user-owned, expires, and is never exposed to another user or channel.

Memory reads, writes, overwrites, and deletions do not add a tool explanation to the assistant answer. The user can inspect the resulting memory through the existing memory surface; the chat only shows a discreet non-interactive indicator.

Sensitive approval uses a user-owned pending record containing the candidate key, value, category, confidence, source message, and expiry. `requestMemoryApproval` creates that record without writing `Memory` and instructs the main model to ask a natural confirmation. On the immediately following user turn, the pending record is supplied as bounded context. `resolveMemoryApproval` accepts, rejects, or leaves it pending only when the response is attributable to that approval request; an unrelated or ambiguous “sì” cannot approve it. Approval writes the single candidate through the same validated upsert path and then marks the pending record resolved.

### Routine policy

The AI may decide to call `proposeRoutine` when a concrete practice would help, even when the user did not use the word “routine”. The tool returns only a validated proposal. Saving, accepting, running, and archiving a routine remain explicit user actions through the existing coaching flow.

### Capability indicators

Capability usage is emitted as an allowlisted, privacy-safe message metadata/data part. The UI renders non-interactive indicators only. Indicators may identify broad usage such as RAG, web, memory, routine, or voice, but must not expose search queries, memory values, approval payloads, document identifiers, or internal reasoning. The assistant prose must not mention tools or internal routing.

## Recommended approach and alternatives

### Recommended: hybrid capability arbitration plus native tool choice

Use a compact structured classifier to choose the allowable capability inventory, then let the main model make the final tool calls with `toolChoice: "auto"`. RAG becomes a bounded `searchRag` tool so it can be selected in the same loop as web search and can be composed with it. This reuses the existing classifier, TurnPlan, tool factories, and telemetry while moving the capability decision from keyword gates into model judgment. Runtime guards remain authoritative for destructive, private, paid, and high-cost operations.

### Alternative A: keep deterministic pre-routing and add more regex rules

This has the smallest diff but preserves the current failure mode: new language patterns must be added manually, capabilities remain mutually constrained, and inferred coaching intent is still missed. Reject.

### Alternative B: expose every tool on every turn without an arbitration layer

This maximizes model freedom but increases latency, prompt/tool noise, accidental side effects, and cost. It also makes guest, plan, and channel restrictions harder to audit. Reject for the first rollout.

## Data flow

1. Authenticate the user and resolve channel, plan, voice preference, memory availability, and hard user constraints.
2. Build bounded current-message and conversation context for capability arbitration, including only an immediately relevant pending memory approval when one exists.
3. Run the structured capability classifier unless a hard rule can safely answer a constraint; validate the classifier output with Zod.
4. Apply server policy to produce the final allowed capability inventory and budgets.
5. Build the prompt with only the selected policy modules and expose only the allowed tools.
6. Run the main model with automatic tool choice. RAG and web may run in the same turn; tool calls remain bounded and instrumented. The legacy pre-generation RAG/web enrichment path is used only in rollback mode.
7. Persist assistant output and privacy-safe capability metadata. Routine data remains a proposal part; memory mutations invalidate the prompt cache.
8. Execute ordinary memory writes silently, create pending sensitive approvals without persistence, and resolve only a directly attributable natural confirmation.
9. Render discreet indicators from the allowlisted metadata/data parts.

Paired-model comparison and prepared-turn execution must consume the same immutable capability decision, with tools and persistent writes disabled for the comparison path.

## Error handling and safety

- Classifier timeout, invalid output, or provider failure uses conservative fallback capabilities and records a diagnostic reason without exposing it to the user.
- RAG, search, fetch, and memory reads fail closed for that capability and still allow a useful text answer when possible.
- Routine validation failure removes the proposal part; the assistant must not claim a routine was created.
- Memory write failure does not fail the chat response; cache invalidation occurs only after a successful write.
- Delete is never broadened from one key to “all related memories”. Ambiguous or missing targets produce no deletion.
- Sensitive approval candidates are never auto-approved by confidence, repetition, or a generic “yes” unrelated to the immediately pending natural-language request.
- Guest turns retain no persistent memory access and retain their existing web/search limits.
- Telemetry records capability selection and outcomes, but excludes query text, memory values, document content, approval payloads, and any new raw URL/query fields. Existing allowlisted web metadata remains unchanged.

## Verification

The implementation must add focused unit coverage for:

- classifier schema parsing, fallback, hard “no web”, explicit deletion, and composable RAG+web decisions;
- TurnPlan capability projection and legacy-mode preservation;
- tool inventory per guest/authenticated/quiet-mode/plan case;
- one RAG lookup and one web search in the same turn, including empty and failed results;
- silent memory create/overwrite/delete with exact ownership and cache invalidation;
- inferred ordinary memory persistence, sensitive approval request, natural approval/rejection, expiry, and ambiguity;
- routine proposal without routine persistence;
- voice selection remaining subject to existing eligibility and quiet-mode policy;
- privacy-safe capability indicators and metadata allowlisting;
- prepared/paired execution not performing tools or writes.

The rollout uses `AI_CAPABILITY_PLANNER_MODE=agentic` for the new path and `AI_CAPABILITY_PLANNER_MODE=legacy` as an operator rollback. Legacy mode preserves current pre-generation RAG/web behavior and post-generation memory extraction while agentic mode uses the capability inventory and validated tools.

Run the relevant Vitest suites, `bun run lint`, `bun run typecheck`, `bun run test`, and `git diff --check`. Browser verification must confirm the indicators are visible but non-interactive and that the assistant response does not narrate internal tool use.

## Out of scope

- A persistent “always voice” setting.
- Automatic routine creation, scheduling, reminders, streaks, or AI progress scoring.
- Guest memory persistence.
- Exposing raw tool traces, reasoning, search queries, memory values, or approval payloads in the UI.
- Replacing the existing voice provider, quota, cadence, or delivery worker.
