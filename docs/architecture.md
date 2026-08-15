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
│  /api/chat │ /api/chats │ /api/coaching/* │ /api/rag/*         │
│  /api/guest/* │ /api/admin/* │ /api/queues/* │ /api/webhooks/* │
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
| `ai/orchestrator.ts`     | Main chat preparation, streaming, prompt composition, and tool exposure |
| `ai/capability-arbitration.ts` | Deterministic capability guards and permission normalization |
| `ai/turn-arbitration.ts` / `ai/execution-routing.ts` | Immutable `TurnDecision`, deterministic fast-path policy, and standard fallback |
| `ai/turn-plan.ts`        | Immutable response, context, prompt, and capability plan |
| `ai/session-manager.ts`  | Builds channel-scoped conversation context and summaries |
| `ai/rag.ts` / `ai/tools/rag.ts` | pgvector retrieval and bounded agentic RAG tool |
| `ai/tools/memory.ts`     | Guarded memory read/write/approval/delete operations |
| `ai/tools/routine-proposal.ts` | Validated proposal-only routine tool |
| `ai/tools/tinyfish.ts`   | TinyFish web search/fetch tools |
| `ai/cost-calculator.ts`  | Normalizes model, token, capability, timing, and cost metrics |
| `ai/providers/`          | OpenRouter model and provider routing |
| `channel-flow/`          | Shared Web, Telegram, and WhatsApp execution/persistence flow |
| `coaching/`              | Routine contracts, runner state, return flow, and analytics |
| `model-experiments/`     | Guarded paired comparisons, votes, lifecycle, and maintenance |
| `voice/`                 | Voice admission, durable generation, private delivery, and cleanup |
| `auth.ts`                | Clerk authentication utilities     |
| `api/responses.ts`       | Shared API response helpers        |
| `rate-limit/`            | Atomic usage reservations, reconciliation, and upgrade state |
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
   ├── Authenticate user or guest
   ├── Validate the message and claimed attachments
   ├── Resolve effective entitlements
   └── Claim the idempotency key and reserve finite usage
          │
          ▼
3. Shared channel flow + orchestrator
   ├── Resolve model and OpenRouter provider options
   ├── Apply deterministic capability guards and fast-path routing rules
   ├── Normalize and freeze one immutable TurnDecision (eligible/planned/executed profiles)
   ├── Normalize and freeze one immutable TurnPlan
   ├── Build same-thread context when selected
   └── Stream with only the selected, server-authorized tools
          │
          ▼
4. Tools (if invoked)
   ├── tinyfishSearch / tinyfishFetch
   ├── searchRag
   ├── get/update user context
   ├── guarded memory operations
   └── proposeRoutine (proposal only)
          │
          ▼
5. Persistence barrier
   ├── Save exactly one assistant message and normalized metrics
   ├── Reconcile the usage reservation atomically
   ├── Persist the completed capability decision
   └── Retain bounded recovery data if final persistence fails; recovery preserves
       the immutable route and fails closed to standard if it is invalid
          │
          ▼
6. Stream response to client
   └── Optionally enqueue durable voice generation after text persists
```

### Execution routing

See [Live AI Profile Routing](ai-live-profile-routing.md) for the complete
operational policy and configuration reference.

Live chat does not call an agentic classifier. Deterministic execution routing
recognizes only obviously self-contained `social`, `rewrite`, `translate`,
`format`, `extract`, and `summarize_supplied` turns; ambiguous work and every
tool-requiring, contextual, coaching, media, approval, voice, or token-bound
case force standard.

The deployed model mapping is unchanged. `light` changes only the execution
bundle (minimal reasoning, no tools, bounded output), not a plan's selected
model. A routing trace separates generation TTFT for the executed attempt and
total-request TTFT from request start; deterministic routing contributes no
classifier latency.

The shared `AI_FAST_PATH_ENABLED=false` kill switch spans Web, Telegram, and
WhatsApp. There is no shadow mode, percentage allocation, or database-backed
task allowlist.

## Key Design Decisions

### Thread-Scoped Context

Raw context is scoped by `ConversationThread`, never shared across channels.
Web chats map one-to-one to a thread; Telegram and WhatsApp use their stable
external thread identifier. Rolling thread summaries keep long conversations
within limits. The older 15-minute session grouping remains for maintenance and
archival compatibility, not as the primary live-chat boundary.

### RAG with pgvector

Documents are chunked and embedded using `openai/text-embedding-3-small` (1536 dimensions) via OpenRouter. Semantic search finds relevant coaching knowledge for responses.

### Multi-Channel Architecture

The `ChannelIdentity` model allows users to interact via Web, Telegram, or WhatsApp with a unified profile and memory.

### Guarded Tool-Based Memory

In agentic mode, the AI may use bounded memory and user-context tools when the
immutable capability decision permits them. Ordinary low-risk facts may be
saved silently; sensitive facts require attributable confirmation, and deletion
requires explicit intent plus one exact server-resolved target. Guests cannot
persist memory.

### Coaching Routine Loop

The assistant can propose a validated routine inside a message, but the tool
cannot save or run it. User acceptance persists a reusable `Routine`; execution
and check-in happen inline through `RoutineAttempt`, with repeat/adapt chats
referencing the original routine rather than copying it.

### Fast Chat Path

Atomic non-guest, text-only turns can use the compact `TurnPlan` profile. It is
selected independently from response brevity and uses only same-thread raw
turns plus a rolling summary; profile, RAG, voice, and tools remain enabled
whenever the plan requires them.

### Current-Information Tools

Current, live, post-cutoff, or explicitly requested web information is handled
through TinyFish tools. The orchestrator starts with a narrow search plan,
enables fetch only when source URLs or page-level reading are useful, and limits
web-search conversation history to reduce latency.

## Related Documentation

-   [Database Schema](./database.md)
-   [AI System](./ai-system.md)
-   [API Reference](./api.md)
