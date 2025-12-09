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
│  /api/chat  │  /api/chats  │  /api/rag  │  /api/usage          │
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
| `ai/orchestrator.ts`     | Main chat streaming with tools     |
| `ai/session-manager.ts`  | Builds conversation context        |
| `ai/rag.ts`              | Document search with embeddings    |
| `ai/memory-extractor.ts` | Extracts and stores user memories  |
| `ai/cost-calculator.ts`  | Tracks AI usage costs              |
| `ai/providers/`          | OpenRouter model configuration     |
| `auth.ts`                | Clerk authentication utilities     |
| `rate-limit.ts`          | Usage limits per subscription tier |
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
   ├── Build system prompt
   ├── Get conversation context (Session Manager)
   ├── Check if RAG needed
   ├── Query RAG for relevant docs
   └── Stream response with tools
          │
          ▼
4. Tools (if invoked)
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

Documents are chunked and embedded using Qwen3-embedding-8b (4096 dimensions). Semantic search finds relevant coaching knowledge for responses.

### Multi-Channel Architecture

The `ChannelIdentity` model allows users to interact via Web or WhatsApp with a unified profile and memory.

### Tool-Based Memory

The AI can use tools (`saveMemory`, `updateProfile`) to persist important user information, creating a personalized coaching experience.

## Related Documentation

-   [Database Schema](./database.md)
-   [AI System](./ai-system.md)
-   [API Reference](./api.md)
