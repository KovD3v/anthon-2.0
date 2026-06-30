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
3. Evaluate web-search intent and classify optional prompt modules.
4. Choose prompt mode (`full`, `guest`, or `simple_fast`).
5. Build conversation context via `buildConversationContext` when needed.
6. Evaluate RAG need (`shouldUseRag`) and fetch context (`getRagContext`) if needed.
7. Build system prompt with the selected modules.
8. Run `streamText` with the selected tools and callbacks.
9. Persist usage metrics, model info, token/cost telemetry, and tool timing.

### Toolset

The orchestrator composes tools from three factories:

- `createMemoryTools(userId)`:
  - `getMemories`
  - `saveMemory`
  - `deleteMemory`
- `createUserContextTools(userId)`:
  - `getUserContext`
  - `updateProfile`
  - `updatePreferences`
  - `addNotes`
- `createTinyfishTools()`:
  - `tinyfishSearch`
  - `tinyfishFetch`

The orchestrator does not expose every tool on every turn. `selectToolPlan`
enables memory/profile writes only when the message asks for persistent changes,
enables `tinyfishSearch` for current or explicit web-search intent, and enables
`tinyfishFetch` only when URL/page/source reading is useful.

### Prompt modes

| Mode | Used for | Behavior |
| ---- | -------- | -------- |
| `full` | Authenticated turns that need normal context/tools | Uses conversation history, optional profile/memory context, optional RAG, optional web tools, and full response budget. |
| `guest` | Guest chat | Uses compact guest prompt and constrained output. |
| `simple_fast` | Simple authenticated text turns without media, voice, RAG, or web-search intent | Skips conversation history, full profile/memory enrichment, RAG, voice config, and tools; may include a tiny user snapshot. |

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

RAG is skipped for guest turns, web-search turns, and `simple_fast` turns. For
normal authenticated turns, the decision pipeline uses layered optimization:

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

## Model Routing

- Files:
  - `src/lib/plans/catalog.ts`
  - `src/lib/ai/providers/openrouter.ts`
  - `src/lib/ai/providers/openrouter-routing.ts`

Plan-level defaults:

| Tier | Orchestrator | Fallback | Sub-agent |
| ---- | ------------ | -------- | --------- |
| `trial` | `z-ai/glm-5.2` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `basic` | `z-ai/glm-5.2` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `basic_plus` | `z-ai/glm-5.2` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash` |
| `pro` | `z-ai/glm-5.2` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |
| `admin` | `z-ai/glm-5.2` | `deepseek/deepseek-v4-flash` | `google/gemini-2.5-flash-lite` |

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

## Chat UI Feedback

The chat UI surfaces live tool activity from streaming AI SDK tool parts:

- search tools: `Sto cercando ...`
- fetch tools: `Estraggo dal sito ...`
- profile/memory/context tools: `Recupero informazioni ...`

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
