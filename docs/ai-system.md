# AI System

The AI subsystem is shared by authenticated web chat, guest web chat, Telegram, and WhatsApp. Channel adapters prepare an inbound context; `src/lib/channel-flow` invokes the orchestrator and persists the assistant result.

## Runtime components

```text
channel adapter
    -> runChannelFlow()
        -> streamChat()
            -> entitlement and model resolution
            -> conversation context
            -> profile, preferences, memories
            -> conditional RAG
            -> tools + streamText()
        -> persistAssistantOutput()
            -> Message + DailyUsage
            -> optional memory extraction
```

| Component | File | Responsibility |
| --- | --- | --- |
| Channel runtime | `src/lib/channel-flow/run.ts` | Normalize input and choose streaming or accumulated-text execution |
| Orchestrator | `src/lib/ai/orchestrator.ts` | Prompt assembly, context, tools, model call, and metrics |
| Provider | `src/lib/ai/providers/openrouter.ts` | OpenRouter client and plan-based model selection |
| Session manager | `src/lib/ai/session-manager.ts` | Chat-scoped history or cross-channel session context |
| RAG | `src/lib/ai/rag.ts` | Chunking, embeddings, gating, and vector retrieval |
| Memory tools | `src/lib/ai/tools/memory.ts` | Read, create, and delete durable memories |
| User-context tools | `src/lib/ai/tools/user-context.ts` | Read/update profile and preferences |
| Web-search tool | `src/lib/ai/tools/tavily.ts` | Current-world search through Tavily |
| Persistence | `src/lib/channel-flow/persistence.ts` | Assistant message, usage, cache tags, and extraction scheduling |

## Orchestrator flow

`streamChat(options)`:

1. Uses supplied entitlements or resolves them from personal and organization data.
2. Selects the model with `getModelForUser(planId, userRole, modelType, modelTier, subscriptionStatus)`.
3. Wraps the model with PostHog AI tracing in privacy mode, omitting model input/output content from the trace.
4. Loads conversation history, user context, memories, and RAG eligibility/context.
5. Builds the sports-performance coaching system prompt.
6. Converts text and file parts into AI SDK model messages.
7. Calls `streamText` with the composed tools and a maximum of five steps.
8. Returns the stream while completion callbacks extract metrics and persist output.

Normal chat execution currently requires:

- `OPENROUTER_API_KEY`;
- `TAVILY_API_KEY` (validated when the tool module is imported);
- `POSTHOG_API_KEY` (used unconditionally when generation starts).

See [Configuration](./configuration.md).

## Prompt context

The prompt combines independent sources:

- current date;
- chat/session history;
- profile and communication preferences;
- durable user memories;
- relevant RAG excerpts;
- channel/voice availability;
- a detected user-style hint when available.

Profile and memory strings are explicitly treated as data rather than executable instructions. The most recent user message takes precedence over stale stored context.

## Toolset

The orchestrator composes three factories.

### Memory tools

- `getMemories`
- `saveMemory`
- `deleteMemory`

Memory extraction can also run after a completed response. Channel options control it; guest web chat disables extraction.

### User-context tools

- `getUserContext`
- `updateProfile`
- `updatePreferences`
- `addNotes`

The system prompt asks the model to save stable identity/sport/goal information and detected language preferences when appropriate.

### Web search

- `tavilySearch`

This is intended for recent external knowledge, not for discovering information about the user.

## Conversation context and sessions

`buildConversationContext()` has two modes:

- With `chatId`, it reads history from that specific web chat.
- Without `chatId`, it reads recent user messages across channels, groups them with a 15-minute gap rule, and may use `SessionSummary` records.

Long-session summarization is non-blocking when possible. If a summary is missing, the request uses a recent-message fallback and schedules summary generation.

Key constants in `src/lib/ai/constants.ts`:

| Setting | Value |
| --- | --- |
| Session gap | 15 minutes |
| Default maximum context messages | 50 |
| User messages before summarization | 25 |
| Recent-message fetch cap | 200 |
| Summary cache TTL | 5 minutes |
| Summary fallback messages | 6 |

Effective plan policy can further constrain the context-message count.

## RAG

The knowledge base is global and backed by PostgreSQL/pgvector.

| Setting | Value |
| --- | --- |
| Embedding provider | OpenRouter embeddings endpoint |
| Embedding model | `openai/text-embedding-3-small` |
| Dimensions | 1536 |
| Similarity threshold | 0.6 |
| Maximum search results | 5 |
| Target chunk size | 800 characters |
| Chunk overlap | 100 characters |
| Embedding retry count | 3 |

### Query gating

`shouldUseRag()` avoids an embedding/search call for messages that do not need the knowledge base:

1. Check whether any documents exist, using a short cache.
2. Accept known positive coaching/technical keywords.
3. Reject short greetings and other negative keywords.
4. Reject non-technical conversational patterns.
5. Use a model classifier for ambiguous cases.

### Core operations

- `searchDocuments(query, limit)`
- `getRagContext(query)`
- `addDocument(title, content, source?, url?)`
- `deleteDocument(documentId)`
- `updateMissingEmbeddings()`

The admin upload route parses supported source files and may retain the original in Vercel Blob before adding extracted text.

## Model routing

`src/lib/plans/catalog.ts` is the source of truth. Current policies are:

| Canonical plan | Orchestrator | Sub-agent |
| --- | --- | --- |
| `GUEST` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |
| `TRIAL` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |
| `BASIC` | `google/gemini-2.0-flash-001` | `google/gemini-2.0-flash-lite-001` |
| `BASIC_PLUS` | `google/gemini-2.0-flash-001` | `google/gemini-2.0-flash-001` |
| `PRO` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |
| `ADMIN` | `google/gemini-2.0-flash-lite-001` | `google/gemini-2.0-flash-lite-001` |

The maintenance model is `google/gemini-2.0-flash-lite-001` for every plan.

The resolver chooses the strongest effective candidate across personal and active organization sources. Model tier is compared before the numeric limit vector; see [Rate Limiting](./rate-limiting.md).

## Persistence and metrics

On completion, `persistAssistantOutput()` stores:

- assistant text as AI SDK message parts;
- model ID;
- input, output, and reasoning tokens;
- cost;
- generation and reasoning times;
- tool-call records;
- RAG usage and chunk count.

It then increments `DailyUsage`. Voice generations create separate `VoiceUsage` rows. When `ELEVENLABS_COST_PER_1000_CHARS_USD` is configured, the tracking helper estimates each generation from its character count and rolls that amount into both `VoiceUsage.costUsd` and daily total/voice cost. An explicit call-site cost still takes precedence.

## Related documentation

- [Architecture](./architecture.md)
- [Database](./database.md)
- [Configuration](./configuration.md)
- [Rate Limiting](./rate-limiting.md)
- [Maintenance](./maintenance.md)
