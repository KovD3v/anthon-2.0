# AI System

The AI subsystem powers chat generation, retrieval, personalization, and background adaptation.

See [Live AI execution](ai-live-profile-routing.md) for the single-path
agentic execution policy and capability boundary.

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
3. Resolve the fail-closed memory-recall release decision once, then apply
   deterministic capability guards without a blocking classifier round trip.
4. Build an immutable `TurnPlan` that independently selects response length,
   thread history, authorized capabilities, and prompt profile.
5. In parallel with same-thread context, run the no-LLM recall planner and load
   at most eight relevant facts plus optional current-thread-first evidence.
6. Expose the server-authorized tool inventory. In the normal agentic path the
   model chooses whether to call none, one, or several of the available web,
   RAG, memory, user-context, recall, and routine tools. RAG is a native,
   once-per-turn retrieval tool and can be composed with TinyFish tools.
   Model-comparison setup is an explicit exception: `prepareChatTurn` may
   materialize bounded RAG context for a safe paired snapshot, without
   exposing executable retrieval tools in that preparation path.
7. Build the system prompt with the selected modules and expose only the
   selected tools.
8. Run `streamText` with the selected tools and callbacks.
9. Persist usage metrics, model info, token/cost telemetry, capability usage,
   and tool timing.
10. For every eligible authenticated completed turn, schedule durable-memory
    consolidation in the background independently of planner mode or tool use.

### Capability arbitration

`src/lib/ai/capability-arbitration.ts` normalizes deterministic capability
guards on each turn. It enforces authentication and guest restrictions,
effective plan entitlements, privacy and approval rules, rate limits and usage
reservations, tool schemas and step limits, exact targets, and idempotent or
at-most-once operations. The normalized decision is frozen and projected into
the `TurnPlan`; it is not a user toggle and it does not grant permissions.

For `agentic` planning, the standard model decides whether to use none, one,
or several of the tools exposed for that turn. Deterministic policy remains
authoritative over which tools may be exposed and over every side effect.

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

The orchestrator exposes only tools authorized by the deterministic server
guards. Profile and preference tools are enabled only when the selected plan
allows persistent changes. The model chooses which authorized tools to call.
Memory tools can silently save ordinary, low-risk facts stated or prudently
inferred by the conversation. Every mutation is user-scoped,
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
| `full` | Authenticated turns | Uses same-thread history, optional profile/memory context, optional RAG, optional web tools, and the normal response budget. |
| `guest` | Guest chat | Uses the guest prompt and constrained output. |

### Current-information flow

Web search is powered by TinyFish:

- `tinyfishSearch` is used for current, live, post-cutoff, or explicit external web requests.
- `tinyfishFetch` is exposed for explicit source/page/link requests and to the
  agentic model when web tools are available; the model decides
  whether fetching is useful after selecting web search.
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

By default, RAG reads use the primary `DATABASE_URL`. For local development,
`RAG_PRODUCTION_DATABASE_URL` can point to the pooled Production database so
the local chat can use the live corpus without moving local user/chat data or
RAG management writes to Production. The override is ignored outside
`NODE_ENV=development`, and its PostgreSQL sessions are read-only.

### Retrieval paths and query gating

The live chat path is agentic. Guests are denied RAG by server policy;
authenticated turns expose the bounded `searchRag` tool when the corpus is
available, and the model decides whether to call it. The tool is independent
of TinyFish search and fetch, so RAG and web research may be composed in one
turn. Model-comparison preparation is an explicit exception and may materialize
bounded context for its paired snapshot.

The deterministic `shouldUseRag` helper remains only for bounded prefetch
callers such as comparison preparation. Its gates are local and fail closed:

1. If no positive RAG keyword is present, reject immediately for live-web
   intent, brief generic coaching advice, short messages containing a
   negative keyword (under 30 characters), or a non-technical pattern.
2. If a positive keyword is present together with brief generic coaching
   advice, reject immediately.
3. Check whether RAG documents exist (cached); if none exist, return false.
4. If a positive keyword is present, return true.
5. Otherwise return false; the live agentic model can still call `searchRag`
   when the server has exposed it.

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
- `reasoningTimeMs` when the provider exposes reasoning stream boundaries
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
| `trial` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash-0731` | `google/gemini-2.5-flash-lite` |
| `basic` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash-0731` | `google/gemini-2.5-flash-lite` |
| `basic_plus` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash-0731` | `google/gemini-2.5-flash` |
| `pro` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash-0731` | `google/gemini-2.5-flash-lite` |
| `admin` | `openai/gpt-5.6-luna` | `deepseek/deepseek-v4-flash-0731` | `google/gemini-2.5-flash-lite` |

Luna requests opt into OpenRouter's OpenAI priority service tier and explicitly
use `medium` reasoning effort to keep visible first-token latency bounded while
retaining reasoning. OpenRouter
may fall back to DeepSeek V4 Flash 0731. Streaming metrics use the model ID
reported by the executed OpenRouter step, so fallback traffic is not attributed
to Luna.

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

### Single-path agentic execution

Live chat does not call an LLM classifier and does not allocate an execution
profile. Deterministic server rules authorize capabilities, then one normal
agentic model generation decides whether to use the exposed web, RAG, memory,
user-context, recall, or routine tools. Web, Telegram, and WhatsApp share this
immutable capability-only decision through the common channel flow.

Authenticated turns use the full prompt; guest turns use the guest prompt.
Briefness changes response length only. Model-comparison preparation freezes
the same capability decision for both variants and excludes comparison output
from durable-memory consolidation.

Current telemetry reports the actual generation and tool timings. It does not
create classifier/profile spans or write `executionRoute`. Nullable historical
route data remains readable only so old records can be migrated or ignored.

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
  SIMILARITY_THRESHOLD: 0.38,
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
