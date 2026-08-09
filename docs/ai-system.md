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
3. Arbitrate capabilities for this message and normalize the result through
   deterministic server-side policy.
4. Build an immutable `TurnPlan` that independently selects response length,
   thread history, capabilities, and prompt profile.
5. Build same-thread conversation context via `buildThreadContext` when needed.
6. Evaluate RAG need (`shouldUseRag`) and fetch context (`getRagContext`) if the
   turn plan selected it.
7. Build the system prompt with the selected modules and expose only the
   selected tools.
8. Run `streamText` with the selected tools and callbacks.
9. Persist usage metrics, model info, token/cost telemetry, capability usage,
   and tool timing.
10. In legacy mode, schedule the post-generation memory extractor in the
    background; in agentic mode, memory tools are the turn's write path.

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

The orchestrator composes tools from three factories:

- `createMemoryTools(userId)`:
  - `getMemories`
  - `saveMemory` (create or update/overwrite by stable key)
  - `requestMemoryApproval`
  - `resolveMemoryApproval`
  - `deleteMemory` (only for a server-resolved exact target)
- `createUserContextTools(userId)`:
  - `getUserContext`
  - `updateProfile`
  - `updatePreferences`
  - `addNotes`
- `createTinyfishTools()`:
  - `tinyfishSearch`
  - `tinyfishFetch`

The orchestrator does not expose every tool on every turn. Profile and
preference tools are enabled only when the selected plan allows persistent
changes. In agentic mode, memory tools can silently save ordinary, low-risk
facts stated or prudently inferred by the conversation. `saveMemory` creates a
new record or updates/overwrites the record for the same stable key. Sensitive
or high-impact facts are not written directly: they create a pending
server-side approval and require a natural confirmation on the attributable
next turn. Explicit deletion is limited to a single exact, server-resolved
memory target; ambiguous, wildcard, category-wide, or inferred deletion is a
no-op.

`proposeRoutine` is proposal-only and validated. It may be called at most once
per turn and cannot save, run, archive, or mutate a `Routine` or
`RoutineAttempt`. The routine schema and server checks enforce the allowed
step kinds, limits, and optional terminal feedback form.

Legacy mode keeps the post-generation memory extractor and its compatibility
behavior. Agentic mode uses the validated memory tools as the turn's write
path; model-comparison pairs persist their planner mode so agentic responses
do not trigger the legacy extractor a second time.

`tinyfishSearch` is enabled for current or explicit web-search intent, and
`tinyfishFetch` only when URL/page/source reading is useful.

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

### Query gating (`shouldUseRag`)

RAG is skipped for guest turns. In agentic mode, RAG and web search are
independent capabilities and may be selected together; the immutable decision
is promoted into the `TurnPlan`, so it cannot be lost because of compact
selection. Legacy mode preserves the compatibility rule that web-search turns
do not also inject RAG. For authenticated turns, the decision pipeline uses
layered optimization:

1. Document existence check (cached)
2. Positive keyword fast-path
3. Negative keyword fast-path for short messages
4. Non-technical pattern rejection
5. LLM classifier fallback (`google/gemini-2.5-flash`)

### Core functions

- `searchDocuments(query, limit)`
- `getRagContext(query)`
- `addDocument(title, content, source?, url?)`
- `updateMissingEmbeddings()`

### Voice output

Voice is not an always-on output mode. The existing voice preflight and
delivery guards (`decideWebVoiceMode` and `decideVoiceDelivery`) remain
authoritative for plan eligibility, user preference, provider capacity,
quota, cadence, anti-spam, and explicit-text/attachment constraints. The
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
| `legacy` | Compatibility path: preserves the legacy RAG/web separation and post-generation memory extraction. |
| `agentic` | Runs the per-message capability classifier, permits composable RAG + web, and delegates validated optional actions to the selected tools. |

The default remains `legacy` until the rollout is deliberately changed. The
separate `AI_TURN_PLANNER_MODE` compatibility switch is not repurposed by this
rollout.

Capability decisions are shared immutably through the common channel flow for
Web, Telegram, and WhatsApp. Web model-comparison preparation freezes the
context and reuses the same decision for both variants and any normal fallback;
the pair stores `capabilityPlannerMode` so legacy memory extraction is not
duplicated for agentic comparisons.

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
  SIMILARITY_THRESHOLD: 0.6,
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
