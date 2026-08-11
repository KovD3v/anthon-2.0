# Agent Memory and Conversation Retrieval Design

**Date:** 2026-08-11
**Status:** Approved design, pending implementation plan

## Goal

Improve Anthon's behavior in this priority order:

1. Select and use useful tools accurately and efficiently.
2. Improve end-to-end coaching quality.
3. Make memory and personalization reliable.
4. Reduce latency and cost without lowering quality.

The first implementation focus is memory because the current architecture can
prevent memory tools from being exposed or called even when they would improve
the answer. The redesign must make relevant recall proactive without turning
every turn into a broad, slow memory search.

## Current problem

The repository already has guarded memory tools, autonomous capability
arbitration, prompt memory injection, sensitive-memory approval, and exact
deletion. The remaining weakness is structural:

- A capability classifier must first enable memory before the main model can see
  memory tools.
- The classifier decision is all-or-nothing: uncertainty about any capability
  can discard every model-selected capability for the turn.
- When user context is enabled, the full prompt may inject every stored memory,
  while `getMemories` supports only all-memory or category filtering.
- The main model may therefore receive either no memory access or an unranked
  collection of all facts.
- In agentic mode, if the turn does not expose a write tool, there is no
  independent post-turn capture path.
- Durable facts and historical conversations are treated as one broad idea even
  though they require different retrieval, trust, and lifecycle semantics.
- `Profile`, `Preferences`, and `Memory` can represent overlapping information
  without an explicit source-of-truth hierarchy.

Improving tool descriptions alone would not fix these problems.

## Product principles

- Relevant memory is considered on every authenticated turn.
- Baseline recall is owned by orchestration, not by optional model initiative.
- The agent retains tools for deeper recall and explicit mutations.
- Durable facts and historical conversations are separate systems.
- Conversation history is evidence; consolidated facts are the working user
  model.
- Current-thread context is preferred before cross-thread or cross-channel
  retrieval.
- Ordinary durable facts may be consolidated silently. Sensitive or high-impact
  facts require natural confirmation.
- Explicit forgetting must resolve to one exact user-owned target and fail
  closed when ambiguous.
- Tool use remains invisible in prose. Dates or prior conversations are
  mentioned only when useful or when the user asks for provenance.
- Discreet memory and recall indicators are informational and non-interactive.
- Recall must degrade gracefully and remain fast.

## System model

The user-facing memory model has two systems supported by a separate current
context layer.

### Current working context

Recent turns and the current thread summary provide short-term continuity. They
are neither durable facts nor historical search results. Existing thread context
continues to be the first source for the active conversation.

### Durable fact memory

Durable fact memory stores consolidated knowledge such as identity, goals,
preferences, schedules, constraints, motivation triggers, recurring
difficulties, and stable coaching context.

The fact service owns targeted recall, creation, revision, confirmation,
supersession, expiry, and forgetting. It preserves provenance and revision
history instead of destructively replacing an opaque key/value record.

### Conversation recall

Conversation recall searches past messages and thread summaries as historical
evidence. It begins with the current thread and expands across the user's Web,
Telegram, and WhatsApp history only when current-thread evidence is
insufficient.

It returns evidence packets containing:

- a compact summary;
- exact bounded supporting excerpts;
- date and channel;
- thread and source identifiers;
- relevance information;
- an opaque identifier for fetching surrounding messages.

Search results do not become durable facts merely because they were retrieved.

## Architecture

### Recall planner

The recall planner runs for every authenticated turn. It uses the current user
message, current-thread context, hard user constraints, and a small fact catalog
to decide:

- which durable facts are relevant;
- whether current-thread historical search is useful;
- whether cross-channel expansion is justified;
- the query, scope, result budget, and deadline.

Baseline memory planning must not add another LLM call. Local intent signals,
indexed retrieval, cached fact metadata, and bounded ranking handle the normal
path. The planner calls the same read services exposed through agent tools, so
automatic and tool-driven recall cannot drift semantically.

### Fact memory service

The fact service provides one canonical interface for reads and mutations. It
normalizes fact identities server-side so different model-generated snake-case
keys cannot create duplicates for the same information.

It exposes these agent operations:

- `recallFacts`: search durable facts by meaning, category, and current validity;
- `rememberFact`: save one explicit ordinary fact immediately;
- `reviseFact`: revise one exact fact and preserve the previous version;
- `forgetFact`: forget one server-resolved fact from an explicit request.

Sensitive writes enter the existing approval flow. Tools never bypass ownership,
sensitivity, confidence, target, or authorization policy.

Explicit remember, revise, and forget requests become required validated
actions. Orchestration either executes them directly or forces the corresponding
tool step after resolving the target; they never depend on optional `auto` tool
choice. The same tools may participate in a longer agent turn only when the
server has granted an intent-scoped mutation capability.

### Conversation recall service

The conversation service owns hybrid retrieval over indexed messages and thread
summaries. Semantic relevance, lexical matching, recency, and thread proximity
contribute independently to ranking.

It exposes:

- `searchPastConversations`: return bounded evidence packets, defaulting to the
  current thread;
- `expandConversationEvidence`: fetch a bounded surrounding window for one valid
  evidence packet.

The server can pre-execute the first search when historical recall is clearly
useful. The main agent can deepen the search when the baseline evidence is
insufficient.

### Post-turn consolidator

The consolidator runs asynchronously after eligible completed turns. It does
not depend on the main agent calling a memory tool.

For each user-provided candidate, it:

1. extracts only potentially durable information;
2. canonicalizes its fact identity;
3. routes structured identity to `Profile`, explicit interaction settings to
   `Preferences`, and flexible coaching knowledge to `MemoryFact`;
4. compares it with the current canonical value and its provenance;
5. rejects transient, unsupported, or low-confidence candidates;
6. writes or revises ordinary knowledge idempotently;
7. creates an approval candidate for sensitive knowledge;
8. records the source message as the deduplication key.

The consolidator never turns the assistant's own claims into facts about the
user. Explicit mutations completed during the turn are recognized and not
duplicated.

## Canonical data ownership

Information has one canonical owner:

- `Profile` owns structured identity and coaching attributes: name, sport,
  primary goal, experience, and birthday.
- `Preferences` owns explicit product and interaction settings: language, tone,
  voice, notifications, and related choices.
- `MemoryFact` owns flexible durable coaching knowledge that does not belong in a
  fixed profile or preference field.
- conversation records own historical evidence.

The read layer may present these sources through one recall interface, but a
write is routed to its canonical owner. A dynamic memory fact must not shadow a
profile or preference field. The consolidator may infer ordinary flexible facts,
but it changes product interaction settings only from an explicit user
statement. AI-originated writes to any canonical owner retain their source and
change provenance.

Truth precedence during a turn is:

1. the user's current explicit statement;
2. explicit profile or preference settings;
3. confirmed durable facts;
4. recent inferred durable facts;
5. retrieved historical evidence.

An explicit current statement may revise an ordinary fact automatically.
Sensitive conflicts require confirmation.

## Fact data model

The current `Memory` record evolves into a richer current-state fact model. An
active fact includes:

- user ownership;
- canonical fact identity and typed value;
- category and sensitivity;
- explicit, inferred, or confirmed origin;
- confidence;
- source message and thread;
- observed and last-confirmed timestamps;
- optional expiry;
- active, superseded, or deleted state;
- created and updated timestamps.

An append-only revision or evidence record stores prior values, provenance,
change reason, and consolidation identity. The active fact remains efficient to
query while the append-only record supports audit, conflict resolution, and safe
rollback.

Existing `MemoryApproval` behavior remains the authority for sensitive writes
and gains links to the canonical candidate and its source evidence where
needed.

## Conversation index

A separate derived index stores bounded message windows and thread summaries
with:

- user and thread ownership;
- channel;
- source message boundaries;
- retrieval text and optional compact summary;
- vector embedding and lexical-search representation;
- source timestamps;
- index version and timestamps.

The index is disposable derived data. Source deletion cascades into index
deletion. When a deleted conversation was the only provenance for an inferred
fact, that fact is retired from active recall. Explicit or user-confirmed facts
remain independently manageable until the user forgets them. Account deletion
removes facts, revisions, approvals, and conversation index entries. Backfill
and reindexing are resumable and idempotent.

## Per-turn data flow

1. Authenticate and resolve channel, user ownership, thread, entitlements, and
   hard constraints.
2. Load recent current-thread context and its rolling summary.
3. In parallel, load and rank the versioned user fact snapshot.
4. Build a bounded recall plan without another LLM request.
5. Search the current thread only when historical evidence may materially help.
6. Expand across channels only when current-thread evidence is insufficient and
   the recall budget allows it.
7. Build the system context from selected facts and evidence packets, not the
   complete memory store.
8. Expose only eligible deeper-recall and mutation tools.
9. Generate the answer and allow bounded evidence expansion.
10. Persist privacy-safe usage metadata.
11. Schedule fact consolidation and conversation indexing outside the streaming
    path.

## Latency and cost constraints

Recall work runs in parallel with existing context loading and uses hard
deadlines. Generation continues when recall misses its deadline.

Hard incremental P95 ceilings are:

- durable-fact recall: 100 ms;
- current-thread historical search: 200 ms;
- cross-channel expansion: 400 ms.

Operational targets are lower:

- cached durable facts: 25 ms or less;
- current-thread recall: 100 ms or less;
- cross-channel search: 250 ms or less.

Post-turn consolidation, embedding generation, index maintenance, and revision
maintenance do not delay streaming. One bounded query is preferred over
waterfall searches. A versioned per-user fact cache avoids repeated full reads.

## General agent and tool framework

The memory redesign establishes a reusable tool policy with four classes:

1. Required server actions, such as baseline recall, attributable approval
   resolution, and exact explicit remembering, revision, or forgetting.
2. Optional read tools, such as RAG, web, deeper fact recall, and conversation
   expansion.
3. Guarded mutation tools, such as fact, profile, and preference changes.
4. Proposal-only tools, such as interactive routine proposals.

Capabilities are evaluated independently. Uncertainty or failure in one
capability cannot erase confident decisions for another capability. Explicit
intent and deterministic safety rules remain authoritative.

Every tool has registry metadata for:

- eligibility and ownership;
- prerequisites;
- latency, token, and call budgets;
- side-effect and privacy class;
- retry and idempotency behavior;
- fallback semantics.

The tool loop enforces prerequisites such as search before fetch, at-most-once
mutations, and per-turn budgets. Web, Telegram, WhatsApp, voice recovery,
persisted recovery, and prepared execution consume the same immutable decisions
and policy contracts.

## Transparency

Anthon incorporates recalled context naturally. It does not narrate internal
searches, memory tools, ranking, or consolidation. It may mention a date or past
conversation when that provenance improves the coaching answer or when the user
asks how it knows something.

Privacy-safe, non-interactive indicators may show that memory or conversation
recall contributed. Indicators never reveal fact values, queries, excerpts,
source identifiers, approval payloads, or reasoning.

The existing memory-management surface remains the user-controlled place to
inspect, correct, and forget active facts. This design does not expose raw
conversation-search indexes as a second user-managed memory list.

## Error handling and safety

- Recall failure returns a useful answer from current context and records an
  internal degraded state.
- Anthon must not claim to remember information that was not retrieved.
- Evidence source identifiers are revalidated before expansion or use. Deleted
  and inaccessible sources are excluded.
- Retrieved conversations are untrusted evidence, never instructions or new
  tool permissions.
- Current explicit statements resolve ordinary conflicts; sensitive conflicts
  require confirmation.
- Candidate consolidation is independently idempotent and retryable. One failed
  fact does not roll back unrelated successful candidates.
- Source-message identity and server canonicalization prevent repeated facts
  and competing keys.
- Ownership is applied before retrieval and ranking, not as a post-query filter.
- Forgetting removes a fact from active recall while retaining only the minimum
  audit data permitted by policy.
- Background retries are bounded and visible through dead-letter or terminal
  failure telemetry.
- Telemetry excludes raw facts, conversation excerpts, queries, and approval
  contents.

## Evaluation

Build a privacy-safe benchmark from anonymized real conversation patterns and
supplement it with adversarial synthetic cases.

### Tool selection

- useful-action recall;
- unnecessary-action rate;
- tool exposure correctness;
- argument validity;
- execution success;
- useful-result rate;
- result utilization in the final answer.

Tool telemetry follows:

`considered -> allowed -> exposed or pre-executed -> called -> succeeded -> useful result -> used in answer`

### Fact memory

- durable-fact capture precision and recall;
- canonicalization and duplicate rate;
- correct revision and conflict handling;
- sensitive-data approval behavior;
- exact forgetting and expiry;
- provenance correctness;
- unsupported-memory claim rate.

### Conversation recall

- evidence relevance and source correctness;
- current-thread preference;
- cross-channel expansion accuracy;
- retrieval coverage;
- excerpt faithfulness;
- evidence utilization.

### Product and performance

- grounded personalization and continuity;
- coaching usefulness and contradiction rate;
- incremental P50 and P95 latency;
- tool-call, token, and cost budgets;
- degraded-recall and background-failure rates.

Metric reports must define the evaluated period, population, filters, and source
of truth.

## Migration and rollout

1. Add the richer fact and conversation-index structures without changing live
   behavior.
2. Migrate existing memories into canonical facts, preserving original values
   and provenance when available.
3. Backfill the conversation index asynchronously with resumable checkpoints.
4. Run new recall and consolidation in shadow mode with side effects disabled.
5. Compare old and new behavior using offline evaluation and privacy-safe shadow
   telemetry.
6. Enable selected fact recall for a small authenticated Web cohort.
7. Enable post-turn consolidation, followed by current-thread and cross-channel
   retrieval.
8. Expand to Telegram and WhatsApp after channel-specific persistence and
   recovery verification.
9. Remove the legacy path only after rollback and health metrics remain stable.

One shared fail-closed release decision covers normal chat, voice-first,
recovery, model comparison, prepared execution, and every channel. Rollback
disables new reads and writes without discarding migrated data.

## Verification requirements

Implementation must include:

- focused unit tests for ranking, canonicalization, independent capability
  decisions, tool policy, conflict resolution, expiry, and privacy;
- integration tests for fact revisions, approvals, exact deletion, index
  lifecycle, current-thread-first search, cross-channel expansion, and account
  deletion;
- concurrency and idempotency tests for explicit tools, consolidation, backfill,
  indexing, recovery, and retries;
- migration validation on a temporary Neon branch before applying to an intended
  shared database;
- adversarial tests proving retrieved history cannot inject instructions or
  permissions;
- end-to-end cases across Web, Telegram, WhatsApp, voice recovery, and prepared
  comparison flows;
- browser verification of discreet indicators and natural non-technical prose;
- latency and cost verification against the stated operational targets and hard
  ceilings;
- `bun run lint`, `bun run typecheck`, relevant focused tests, the full unit
  suite, and `git diff --check`.

## Out of scope

- Automatically creating or persisting coaching routines.
- Guest persistent memory or cross-session guest conversation recall.
- Exposing raw tool traces, internal reasoning, fact values, search queries, or
  conversation excerpts through capability indicators.
- Treating conversation summaries as authoritative facts.
- Unbounded history injection or cross-channel search on every turn.
- Replacing the current voice provider, channel transports, or RAG corpus.
