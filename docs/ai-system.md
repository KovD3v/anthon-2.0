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
3. Build conversation context via `buildConversationContext`.
4. Evaluate RAG need (`shouldUseRag`) and fetch context (`getRagContext`) if needed.
5. Build system prompt with profile/preferences/memories/date.
6. Run `streamText` with tools and callbacks.
7. Persist usage metrics, model info, token/cost telemetry.

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
- `createTavilyTools()`:
  - `tavilySearch`

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

The decision pipeline uses layered optimization:

1. Document existence check (cached)
2. Positive keyword fast-path
3. Negative keyword fast-path for short messages
4. Non-technical pattern rejection
5. LLM classifier fallback (`google/gemini-2.0-flash-001`)

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

- File: `src/lib/ai/providers/openrouter.ts`

Plan-level defaults:

| Tier | Orchestrator | Sub-agent |
| ---- | ------------ | --------- |
| `trial` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |
| `basic` | `google/gemini-2.0-flash-001` | `google/gemini-2.0-flash-lite-001` |
| `basic_plus` | `google/gemini-2.0-flash-001` | `google/gemini-2.0-flash-001` |
| `pro` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |
| `admin` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |

Maintenance model:

- `google/gemini-2.0-flash-lite-001`

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
