# Architecture Overview

Anthon 2.0 is built on Next.js 16 with the App Router, following a modular architecture that separates concerns between AI processing, data management, and user interface.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                         │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js App Router                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ (marketing)  │  │   (chat)     │  │   (admin)    │          │
│  │    pages     │  │    pages     │  │    pages     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Routes                                │
│  /api/chat  │  /api/chats  │  /api/rag/* │ /api/usage          │
│  /api/preferences │ /api/guest/* │ /api/webhooks/*            │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Core Libraries (src/lib)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐│
│  │ Orchestrator│  │    RAG     │  │  Session   │  │   Auth     ││
│  │             │  │   System   │  │  Manager   │  │            ││
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘│
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │  Memory    │  │   Rate     │  │    Cost    │                 │
│  │ Extractor  │  │  Limiter   │  │ Calculator │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │PostgreSQL│  │OpenRouter│  │  Clerk   │
              │+ pgvector│  │   API    │  │   Auth   │
              └──────────┘  └──────────┘  └──────────┘
```

## Directory Structure

### `/src/app` - Next.js App Router

```
app/
├── (marketing)/     # Public pages (landing, pricing)
├── (chat)/          # Protected chat interface
│   ├── chat/        # Chat page with conversation UI
│   └── components/  # Chat-specific components
├── (admin)/         # Admin dashboard
├── api/             # API route handlers
├── layout.tsx       # Root layout
└── globals.css      # Global styles
```

### `/src/lib` - Core Business Logic

| Module                   | Purpose                            |
| ------------------------ | ---------------------------------- |
| `ai/orchestrator.ts`     | Main chat streaming, prompt modes, and tool gating |
| `ai/session-manager.ts`  | Builds conversation context        |
| `ai/rag.ts`              | Document search with embeddings    |
| `ai/memory-extractor.ts` | Extracts and stores user memories  |
| `ai/cost-calculator.ts`  | Tracks AI usage costs              |
| `ai/providers/`          | OpenRouter model and provider routing |
| `ai/tools/tinyfish.ts`   | TinyFish web search/fetch tools    |
| `auth.ts`                | Clerk authentication utilities     |
| `api/responses.ts`       | Shared API response helpers        |
| `rate-limit/`            | Usage limits per subscription tier (types, config, usage tracking, checking, upgrade CTA) |
| `organizations/`         | B2B organization management (Clerk API wrappers, audit logging, helpers, service logic) |
| `db.ts`                  | Prisma client instance             |

### `/src/components` - Shared Components

```
components/
├── ui/         # Base UI components (Button, Dialog, etc.)
└── providers/  # Context providers (Theme, etc.)
```

## Request Flow

### Chat Message Flow

```
1. User sends message
          │
          ▼
2. POST /api/chat
   ├── Check rate limit
   ├── Validate input
   └── Start streaming
          │
          ▼
3. Orchestrator
   ├── Resolve model and OpenRouter provider options
   ├── Classify prompt modules and choose prompt mode
   ├── Get conversation context when needed
   ├── Gate RAG and web tools by intent
   └── Stream response with selected tools
          │
          ▼
4. Tools (if invoked)
   ├── tinyfishSearch / tinyfishFetch
   ├── updateProfile
   ├── updatePreferences
   ├── saveMemory
   └── addNotes
          │
          ▼
5. Save message to database
   ├── Track tokens/cost
   └── Update daily usage
          │
          ▼
6. Stream response to client
```

## Key Design Decisions

### Session-Based Context

Messages are grouped into sessions (15-minute gaps = new session). Long sessions are summarized to stay within token limits while preserving context.

### RAG with pgvector

Documents are chunked and embedded using `openai/text-embedding-3-small` (1536 dimensions) via OpenRouter. Semantic search finds relevant coaching knowledge for responses.

### Multi-Channel Architecture

The `ChannelIdentity` model allows users to interact via Web, Telegram, or WhatsApp with a unified profile and memory.

### Tool-Based Memory

The AI can use tools (`saveMemory`, `updateProfile`) to persist important user information, creating a personalized coaching experience.

### Fast Chat Path

Simple non-guest, text-only turns can use a `simple_fast` prompt mode. This
path skips conversation history, full profile/memory enrichment, RAG, voice
configuration, and runtime tools, while still allowing a compact user snapshot.

### Current-Information Tools

Current, live, post-cutoff, or explicitly requested web information is handled
through TinyFish tools. The orchestrator starts with a narrow search plan,
enables fetch only when source URLs or page-level reading are useful, and limits
web-search conversation history to reduce latency.

## Related Documentation

-   [Database Schema](./database.md)
-   [AI System](./ai-system.md)
-   [API Reference](./api.md)
