# AI System

The AI subsystem powers chat generation, retrieval, personalization, and background adaptation.

## Components Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                          │
│          streamChat() + tools + model routing           │
└─────────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Session    │ │     RAG      │ │    Memory    │
│   Manager    │ │    System    │ │   Tools      │
└──────────────┘ └──────────────┘ └──────────────┘
          │              │              │
          ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Messages   │ │  RagChunks   │ │ Profile/Pref │
│  + Summaries │ │  (pgvector)  │ │ + Memories   │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Orchestrator

- File: `src/lib/ai/orchestrator.ts`
- Main entrypoint: `streamChat(options)`
- Runtime model selection: `getModelForUser(planId, userRole, modelTier)`

### Runtime flow

1. Resolve effective entitlements (`resolveEffectiveEntitlements`).
2. Select model by plan/role/tier.
3. Resolve the fail-closed memory-recall release decision once, then arbitrate
   capabilities independently so one uncertain vote cannot erase confident
   decisions for other capabilities.
4. Build an immutable `TurnPlan` that independently selects response length,
   thread history, capabilities, and prompt profile.
5. In parallel with same-thread context, run the no-LLM recall planner and load
   at most eight relevant facts plus optional current-thread-first evidence.
6. Route retrieval according to the planner mode:
   - In legacy mode, use the `shouldUseRag`/`getRagContext` prefetch path when
     the turn plan selects RAG. A non-fallback classifier decision may allow
     the prefetch directly; otherwise `shouldUseRag` applies its local gates
     and classifier fallback.
   - In normal agentic turns, do not prefetch RAG. When RAG is selected,
     expose `createRagTools().searchRag` as a native, once-per-turn retrieval
     tool. It can run alongside TinyFish search/fetch and calls
     `getRagContext` with the model's bounded query. Model-comparison setup is
     an explicit exception: `prepareChatTurn` may prepare bounded RAG context
     through `shouldUseRag`/`getRagContext` for a safe paired snapshot, without
     exposing executable retrieval tools in that preparation path.
7. Build the system prompt with the selected modules and expose only the
   selected tools.
8. Run `streamText` with the selected tools and callbacks.
9. Persist usage metrics, model info, token/cost telemetry, capability usage,
   and tool timing.
10. For every eligible authenticated completed turn, schedule durable-memory
    consolidation in the background independently of planner mode or tool use.

### Per-message capability arbitration

`src/lib/ai/capability-arbitration.ts` classifies optional capabilities on
each turn. The classifier may select any useful combination of RAG, web
search/fetch, memory read/write/delete, user context, routine proposal, and
voice output. The normalized decision is frozen and projected into the
`TurnPlan`; it is not a user toggle and it does not grant permissions.

Deterministic policy remains authoritative around the model choice and every
side effect: authentication and guest restrictions, effective plan
entitlements, privacy and approval rules, rate limits and usage reservations,
tool schemas and step limits, exact targets, and idempotent or at-most-once
operations. If classification is unavailable or uncertain, the server uses
the deterministic fallback.

### Toolset

The orchestrator composes tools from several factories:

- `createMemoryTools(userId)`:
  - `recallFacts` (`getMemories` compatibility alias)
  - `rememberFact` (`saveMemory` compatibility alias)
  - `reviseFact`
  - `forgetFact` (`deleteMemory` compatibility alias)
  - `requestMemoryApproval`
  - `resolveMemoryApproval`
- `createUserContextTools(userId)`:
  - `getUserContext`
  - `updateProfile`
  - `updatePreferences`
  - `addNotes`
- `createTinyfishTools()`:
  - `tinyfishSearch`
  - `tinyfishFetch`
- `createRagTools()` (agentic mode only):
  - `searchRag` (one bounded retrieval per turn)
- `createConversationRecallTools(context)` (active recall only):
  - `searchPastConversations` (current thread first)
  - `expandConversationEvidence` (same-turn opaque evidence IDs only)

The orchestrator does not expose every tool on every turn. Profile and
preference tools are enabled only when the selected plan allows persistent
changes. Memory tools can silently save ordinary, low-risk facts stated or
prudently inferred by the conversation. Every mutation is user-scoped,
idempotent, and revisioned. Sensitive or high-impact facts are not written
directly: they create a pending server-side approval. A confirmation is valid
only after one assistant response has been durably linked as the natural
presentation and the user's immediately following same-thread reply explicitly
approves or rejects it. Explicit deletion is limited to one exact,
server-resolved fact; ambiguous, wildcard, category-wide, or inferred deletion
is a no-op.

`proposeRoutine` is proposal-only and validated. It may be called at most once
per turn and cannot save, run, archive, or mutate a `Routine` or
`RoutineAttempt`. The routine schema and server checks enforce the allowed
step kinds, limits, and optional terminal feedback form.

Tool mutations handle explicit in-turn actions. Independently, shared channel
persistence schedules post-turn consolidation for valid authenticated Web,
Telegram, and WhatsApp responses in both planner modes. Guest turns, invalid
recovery metadata, empty or deleted inbound messages, duplicate persistence,
and model-comparison output do not enter consolidation.

`tinyfishSearch` is enabled for current or explicit web-search intent, and
`tinyfishFetch` only when URL/page/source reading is useful.

## Durable Fact Memory

Durable user knowledge has one canonical owner:

- `Profile`: name, sport, primary goal, experience, birthday, and profile notes.
- `Preferences`: explicit interaction settings such as language, tone, mode,
  voice, and notifications.
- `Memory`: flexible durable coaching facts that do not belong to a fixed field.
- conversation messages: historical evidence, not a substitute fact store.

`src/lib/ai/memory-canonicalization.ts` prevents a flexible fact from shadowing
a profile or preference field. `src/lib/ai/memory-facts.ts` owns bounded recall,
remember, revise, and soft-forget operations. An active fact records origin,
sensitivity, confidence, source message/thread, observation time, optional
expiry, and lifecycle status. `MemoryRevision` records the previous and next
value, source, reason, and a unique deduplication identity for every mutation.
Forgetting changes the fact to `DELETED`; it does not hard-delete audit history.

Recall applies user ownership, `ACTIVE` status, and expiry constraints in the
database before local ranking. It caches a maximum 64-row user snapshot for 30
seconds, returns at most eight prompt facts, and fails open with no recalled
facts when storage is unavailable. The operational target is at most 25 ms for
a cached fact snapshot and the incremental P95 ceiling is 100 ms.

`src/lib/ai/memory-consolidator.ts` runs after response persistence and never
blocks streaming. It extracts at most eight bounded candidates from user text;
the assistant may disambiguate context but is never accepted as evidence.
Unsupported, transient, low-confidence, or inferred interaction settings are
rejected. Ordinary candidates route to their canonical owner with
`memory:<inboundMessageId>:<canonicalKey>` idempotency. Sensitive candidates
remain unpresented approvals until a later normal turn requests confirmation.

Truth precedence is: the user's current explicit statement, explicit profile
or preference fields, confirmed durable facts, recent inferred facts, then
historical conversation evidence. Explicit ordinary changes may revise a fact;
sensitive conflicts always use approval.

### Proactive recall release and operations

`AI_MEMORY_RECALL_MODE` is a closed `off | shadow | active` switch and defaults
to `off`. Guests and sessions with memory disabled always resolve to `off`.
`shadow` runs bounded retrieval and records only aggregate counts/timings but
injects no context and exposes no recall IDs or tools. `active` injects only the
selected evidence and enables bounded deep-recall tools. Roll back immediately
by setting the mode to `off`; persistence and recovery consume the immutable
per-turn decision and never reread the environment.

Tool policy classifies each allowlisted operation as required, read, mutation,
or proposal, with prerequisites and per-turn budgets. Explicit memory deletion
and attributable approval resolution remain deterministic required actions;
optional model initiative cannot suppress them. Telemetry records only the
considered, allowed, called, succeeded, useful, and utilized counts plus recall
mode, counts, bounded timings, and degradation. It excludes facts, queries,
excerpts, URLs, source IDs, arguments, and tool results.

The offline benchmark runs with `bun run benchmark:memory-recall`. It defaults
to 30 fictionalized Italian fixtures and requires explicit `--allow-db-read`
and `--allow-db-mutation` authority before accessing or changing database data.
The report defines its fixture version, source, filters, action recall/overuse,
fact and evidence quality, duplicate/conflict safety, unsupported claims,
latency percentiles, and cost.

### Prompt modes

| Mode | Used for | Behavior |
| ---- | -------- | -------- |
| `full` | Authenticated turns that need normal context/tools | Uses same-thread history, optional profile/memory context, optional RAG, optional web tools, and full response budget. |
| `guest` | Guest chat | Uses compact guest prompt and constrained output. |
| `compact` | Atomic greetings or self-contained motivation with no external capability | Uses up to three complete same-thread turns plus a rolling summary and a tiny user snapshot. Response brevity alone never selects it. |

### Current-information flow

Web search is powered by TinyFish:

- `tinyfishSearch` is used for current, live, post-cutoff, or explicit external web requests.
- `tinyfishFetch` is only exposed when the user asks for source/page/link reading or the classifier marks fetch as useful.
- Brief current-information requests should normally use one broad search query and answer from the compact result snippets.
- Search history context is capped separately from normal chat context to keep these turns low latency.

## Session Manager

- File: `src/lib/ai/session-manager.ts`
- Session gap: 15 minutes (`SESSION.GAP_MS`)

### Behavior

- With `chatId`: returns chat-scoped history (no cross-chat session summarization).
- Without `chatId`: groups messages by session and may summarize long sessions.
- Summaries are cached in DB (`SessionSummary`) via `src/lib/ai/session-cache.ts` with TTL.
- If a summary is missing, summarization runs in background and a recent-message fallback is used.

## RAG System

- File: `src/lib/ai/rag.ts`
- Embedding model: `openai/text-embedding-3-small` via OpenRouter
- Embedding dimensions: `1536`
- Storage: `RagChunk.embedding` (`vector(1536)`)

### Retrieval paths and query gating

The orchestrator skips RAG for guest turns before invoking the retrieval
gates. Authenticated turns have two distinct paths:

- Legacy prefetch uses `shouldUseRag` and then `getRagContext` to inject
  retrieved context before generation. Legacy web-search turns preserve the
  compatibility rule that they do not also inject RAG.
- Normal agentic retrieval exposes `createRagTools().searchRag` only when the
  capability decision selects RAG. This is a native tool, not a prefetch: it
  calls `getRagContext` once with a bounded model-selected query. It is
  independent of the TinyFish `tinyfishSearch` and `tinyfishFetch` tools, so
  RAG and web search/fetch may be composed in the same turn. Model-comparison
  preparation is an explicit exception: it may use `shouldUseRag` and
  `getRagContext` to materialize bounded context for the paired snapshot, but
  does not expose executable retrieval tools during that setup.

The following is the implementation order inside `shouldUseRag`; it applies to
the legacy prefetch path:

1. If no positive RAG keyword is present, reject immediately for live-web
   intent, brief generic coaching advice, short messages containing a
   negative keyword (under 30 characters), or a non-technical pattern.
2. If a positive keyword is present together with brief generic coaching
   advice, reject immediately.
3. Check whether RAG documents exist (cached); if none exist, return false.
4. If a positive keyword is present, return true.
5. Otherwise consult the five-minute classification cache, then the LLM
   classifier (`google/gemini-2.5-flash`) as the final fallback. Classifier
   failures return false.

### Core functions

- `searchDocuments(query, limit)`
- `getRagContext(query)`
- `createRagTools().searchRag` (agentic native retrieval)
- `addDocument(title, content, source?, url?)`
- `updateMissingEmbeddings()`

### Voice output

Voice is not an always-on output mode. The existing voice preflight and
delivery guards (`decideWebVoiceMode` and `decideVoiceDelivery`) remain
authoritative for plan eligibility, user preference, provider capacity,
quota, cadence, anti-spam, and explicit-text constraints. The
capability planner can record a voice decision only when the requested output
mode and those guards allow it; it cannot bypass them. Audio is attributed as
used only after successful delivery.

## Cost and Metrics

- File: `src/lib/ai/cost-calculator.ts`
- Token/cost extraction from AI results
- Pricing source: TokenLens/OpenRouter pricing integration

Tracked metrics include:

- `model`
- `inputTokens`
- `outputTokens`
- `reasoningTokens`
- `costUsd`
- `generationTimeMs`
- `capabilitiesUsed` (`rag`, `web`, `memory`, `routine`, `voice`)

Capability usage is filtered against the immutable decision in agentic mode.
Provider metadata, reasoning content, raw tool arguments/results, search
queries, memory values, and internal identifiers are not persisted as user
facing capability metadata.

## Model Routing

- Files:
  - `src/lib/plans/catalog.ts`
  - `src/lib/ai/providers/openrouter.ts`
  - `src/lib/ai/providers/openrouter-routing.ts`

Plan-level defaults:

| Tier | Orchestrator | Fallback | Sub-agent |
| ---- | ------------ | -------- | --------- |
| `trial` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `basic` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `basic_plus` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash` |
| `pro` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `admin` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |

Luna requests opt into OpenRouter's OpenAI priority service tier. OpenRouter
may fall back according to its priority-tier routing rules, and the existing
DeepSeek model fallback remains configured.

Image chat uses `moonshotai/kimi-k2.7-code` for the orchestrator unless an
internal benchmark explicitly overrides the model.

Maintenance model:

- `google/gemini-2.5-flash-lite`

OpenRouter provider routing defaults to latency sorting. Runtime provider
options are cached per model/env combination, support price/throughput/latency
sorting, manual order/only/ignore lists, max-price constraints, zero-data-retention
preference, recent-error penalties, and an `e2e-latency` scorer when provider
health and cost snapshots are supplied.

`streamText` also passes `promptCaching: true` and `session_id` to OpenRouter so
providers that support cache/session affinity can reuse prompt context.

### Capability planner rollout

`AI_CAPABILITY_PLANNER_MODE` is the rollout switch and accepts `agentic` or
`legacy`; missing or invalid values resolve to `legacy`.

| Mode | Behavior |
| ---- | -------- |
| `legacy` | Compatibility path that preserves legacy RAG/web separation; shared post-turn fact consolidation still runs. |
| `agentic` | Runs per-message capability classification, composable RAG + web, and validated optional tools; shared consolidation still runs. |

The default remains `legacy` until the rollout is deliberately changed. The
separate `AI_TURN_PLANNER_MODE` compatibility switch is not repurposed by this
rollout.

Capability decisions are shared immutably through the common channel flow for
Web, Telegram, and WhatsApp. Web model-comparison preparation freezes the
context and reuses the same decision for both variants and any normal fallback.
Model-comparison responses are excluded from durable-memory consolidation so
an unselected experimental answer cannot become user knowledge.

### Conversation recall

Conversation recall is separate from durable fact memory. Completed turns are
indexed asynchronously as bounded, role-prefixed windows; embedding failures do
not affect streaming or message persistence. The index is disposable and can be
rebuilt with `bun run backfill:conversation-recall -- --dry-run` followed by an
explicit `--apply` run. The backfill supports `--after-thread-id` checkpoints and
never prints message content.

Search validates user and thread ownership before ranking, queries the active
thread first, and expands to other channels only when current-thread evidence is
insufficient and server policy permits it. Semantic similarity, lexical rank,
recency, and thread proximity contribute to the score; lexical and recency
remain available if embedding generation fails. Current-thread recall targets
100 ms (200 ms incremental P95 ceiling); cross-channel expansion targets 250 ms
(400 ms incremental P95 ceiling).

The model receives at most four privacy-safe evidence packets with opaque IDs,
bounded excerpts, dates, channels, and relevance. Retrieved text is untrusted
evidence, never instructions or authorization. Expansion is limited to an ID
returned in the same turn, revalidates the active source and ownership, clamps
the surrounding-message window, and excludes soft-deleted messages.

The planner-mode schema change is migration-backed. Apply
`prisma/migrations/20260809130000_add_model_comparison_capability_planner_mode`
with the deployment migration path, then run `bunx prisma generate` before
typecheck or runtime verification. Existing model-comparison pairs default to
`legacy`.

## Chat UI Feedback

The UI may show a generic, non-interactive status while a selected tool is
active. After completion it exposes only discreet informational indicators
from a closed capability vocabulary: `Contesto`, `Ricerca`, `Memoria`,
`Routine`, and `Voce`. Indicators do not include raw payloads, tool names,
search queries, memory values, reasoning, or IDs, and they are not controls or
an explanation of the model's internal reasoning.

Assistant message bubbles are kept stable during streaming to avoid layout
animation while content is arriving.

## Audio Transcription

- Service boundary: `src/lib/transcription/service.ts`
- Primary provider: `openai/whisper-large-v3-turbo` via OpenRouter
- Fallback provider: `google/gemini-2.5-flash-lite` via OpenRouter chat completions

Web, Telegram, and WhatsApp audio all call the shared transcription service
before the orchestrator receives user input. The Whisper Turbo path uses
OpenRouter's `/api/v1/audio/transcriptions` endpoint for lower latency and
lower per-hour STT cost, while Gemini remains as a fallback for provider
failures.

## Constants

- File: `src/lib/ai/constants.ts`

```ts
export const SESSION = {
  GAP_MS: 15 * 60 * 1000,
  MAX_CONTEXT_MESSAGES: 50,
  MAX_USER_MESSAGES_PER_SESSION: 25,
  RECENT_MESSAGES_LIMIT: 200,
  CACHE_TTL_MS: 5 * 60 * 1000,
  FALLBACK_RECENT_MESSAGES: 6,
};

export const RAG = {
  SIMILARITY_THRESHOLD: 0.55,
  BATCH_SIZE: 10,
  MAX_RESULTS: 5,
  CHUNK_SIZE: 800,
  CHUNK_OVERLAP: 100,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 1000,
};
```

## Related Documentation

- [Architecture](./architecture.md)
- [Database](./database.md)
- [API Reference](./api.md)
- [Maintenance](./maintenance.md)
