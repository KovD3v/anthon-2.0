# AI System

The AI system is the core of Anthon, handling conversation processing, context management, and response generation.

## Components Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                          │
│         (Main entry point for chat streaming)           │
└─────────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Session    │ │     RAG      │ │    Memory    │
│   Manager    │ │    System    │ │  Extractor   │
└──────────────┘ └──────────────┘ └──────────────┘
          │              │              │
          ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Messages   │ │  RagChunks   │ │   Memories   │
│   (Prisma)   │ │  (pgvector)  │ │   (Prisma)   │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Orchestrator

**File:** `src/lib/ai/orchestrator.ts`

The orchestrator is the main entry point for chat streaming. It coordinates all AI components.

### `streamChat(options)`

Streams a chat response with tool support using Vercel AI SDK `streamText`.

```typescript
interface StreamChatOptions {
	userId: string;
	userMessage: string;
	planId?: string | null;
	userRole?: string;
	hasImages?: boolean;
	messageParts?: Array<{ type: string; text?: string; data?: string }>;
	onFinish?: (result: { text: string; metrics: AIMetrics }) => void;
	onStepFinish?: (step: { text?: string; toolCalls?: unknown[] }) => void;
}
```

### Flow

1. **Build System Prompt** - Injects user profile, preferences, memories
2. **Get Conversation Context** - Via Session Manager
3. **Check RAG Needed** - Via `shouldUseRag()` with latency optimization
4. **Query RAG** - Gets relevant document chunks
5. **Stream Response** - With Vercel AI SDK v6
6. **Execute Tools** - If AI invokes any (e.g. `saveMemory`)
7. **Track Metrics** - Tokens, cost, timing via `LatencyLogger`

### Tools

The AI can invoke these tools during conversation:

| Tool                | Purpose                                 |
| ------------------- | --------------------------------------- |
| `updateProfile`     | Update user profile (name, sport, goal) |
| `updatePreferences` | Set tone/mode/language preferences      |
| `saveMemory`        | Store persistent user information       |
| `addNotes`          | Add coach's private notes               |

## Session Manager

**File:** `src/lib/ai/session-manager.ts`

Manages conversation context by grouping messages into sessions.

### Session Logic

-   **Session Gap:** 15 minutes between messages = new session
-   **Max Messages:** 50 total in context
-   **Summarization:** Sessions with >25 user messages are summarized

### `buildConversationContext(userId)`

Returns `ModelMessage[]` for the AI context:

1. Fetch recent messages (limited)
2. Group into sessions (15-min gaps)
3. Process from newest to oldest
4. Include complete sessions only
5. Summarize long sessions on-demand
6. Stop at message cap

### Session Summarization

Long sessions are summarized using a sub-agent (Gemini Flash) to stay within token limits while preserving context.

```typescript
// Summary is cached with 5-minute TTL
const sessionSummaryCache = new Map<
	string,
	{ summary: string; expires: number }
>();
```

## RAG System

**File:** `src/lib/ai/rag.ts`

Retrieval Augmented Generation for knowledge-based responses.

### Embeddings

-   **Model:** `openai/text-embedding-3-small` via OpenRouter
-   **Dimensions:** 1536
-   **Storage:** pgvector in PostgreSQL

### Key Functions

#### `shouldUseRag(userMessage)`

Determines if a query needs RAG context using a **5-layer optimization strategy** to minimize costs and latency:

1.  **Document Existence Check:** Fail fast if no documents exist (cached).
2.  **Positive Keywords:** Instant match for technical terms (e.g., "metodo", "sincro", "coaching").
3.  **Negative Keywords:** Instant skip for short social messages (e.g., "ciao", "grazie").
4.  **Pattern Matching:** Skip personal/emotional queries not related to methodology.
5.  **Fast LLM Classification:** Use **Gemini 2.0 Flash** (~200ms) as a fallback classifier for uncertain cases.

#### `searchDocuments(query, limit)`

Semantic search using cosine similarity:

```typescript
const results = await searchDocuments("visualizzazione mentale", 5);
// Returns: [{ content, title, similarity }]
```

#### `addDocument(title, content, source?, url?)`

Adds a document to the knowledge base:

1.  Split into chunks (800 chars with overlap)
2.  Generate embeddings for each chunk
3.  Store in RagChunk table

### Document Processing

```
Document → splitIntoChunks() → generateEmbeddings() → Store in DB
                │
         ┌──────┴──────┐
         │  Paragraph  │
         │   Based     │
         │  + Overlap  │
         └─────────────┘
```

## Memory Extractor

**File:** `src/lib/ai/memory-extractor.ts`

Extracts and stores important user information from conversations.

### Memory Operations

```typescript
// Save a memory
await saveMemory(userId, "favorite_sport", { value: "tennis" });

// Get all memories for a user
const memories = await getMemories(userId);

// Memories are unique per key, upserted on conflict
```

### Memory Types

| Key Pattern  | Example                        |
| ------------ | ------------------------------ |
| `favorite_*` | `favorite_sport: "tennis"`     |
| `goal_*`     | `goal_main: "improve focus"`   |
| `pattern_*`  | `pattern_anxiety: "pre-match"` |

## Automated Maintenance System

**Directory:** `src/lib/maintenance/`

Background system powered by **Upstash QStash** to keep data clean and efficient.

### Jobs

1.  **Memory Consolidation** (`memory-consolidation.ts`)
    -   Runs daily via cron.
    -   Merges duplicate/obsolete memories using Gemini 2.0 Flash.
    -   Groups memories by category (sport, goals, personal).

2.  **Profile Analyzer** (`profile-analyzer.ts`)
    -   Runs weekly.
    -   Analyzes conversation history to build psychometric profile (writing style, communication patterns).
    -   Updates `UserPreferences` for better mirroring.

3.  **Session Archiver** (`session-archiver.ts`)
    -   Runs daily.
    -   Summarizes old sessions (>24h).
    -   Moves messages to `SessionSummary` and deletes raw messages (depending on retention policy).
    -   Significantly reduces context window costs.

## Cost Calculator

**File:** `src/lib/ai/cost-calculator.ts`

Tracks AI usage and costs using TokenLens for OpenRouter pricing.

### `extractAIMetrics(result)`

Extracts metrics from AI response:

```typescript
interface AIMetrics {
	model: string;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens?: number;
	costUsd: number;
	generationTimeMs: number;
}
```

### Pricing

Pricing is fetched from OpenRouter API via TokenLens library, supporting all models dynamically.

## AI Providers

**File:** `src/lib/ai/providers/openrouter.ts`

Configures AI models via OpenRouter.

### Model Selection

```typescript
// Get model for user based on plan
const model = getModelForUser(planId, hasImages);

// Models by tier:
// - Free tier: grok-4.1-fast:free, gemini-2.5-flash:free
// - Paid tiers: gpt-4.1-mini, gemini-2.5-flash
// - Vision: gemini-2.5-flash (when hasImages=true)
```

### Sub-Agent Model

For internal tasks (summarization, RAG classification, maintenance):

-   Model: `gemini/gemini-2.0-flash-001`
-   Used by Session Manager, RAG system, and Maintenance jobs.

## Constants

**File:** `src/lib/ai/constants.ts`

Centralized configuration values:

```typescript
export const SESSION = {
	GAP_MS: 15 * 60 * 1000, // 15 minutes
	MAX_CONTEXT_MESSAGES: 50,
	MAX_USER_MESSAGES_PER_SESSION: 25,
	RECENT_MESSAGES_LIMIT: 200,
	CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
};

export const RAG = {
	MAX_RETRIES: 3,
	RETRY_BACKOFF_MS: 1000,
	SIMILARITY_THRESHOLD: 0.3,
};
```

## Related Documentation

-   [Architecture](./architecture.md) - System overview
-   [API Reference](./api.md) - Chat API endpoints
-   [Database](./database.md) - Message and memory storage
-   [Maintenance](./maintenance.md) - Automated jobs and QStash configuration
