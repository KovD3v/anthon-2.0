# Anthon 2.0

An AI-powered coaching chat application built with Next.js 16, featuring intelligent conversation management, RAG-based knowledge retrieval, and multi-channel support.

## ✨ Features

-   **AI Coaching Chat** - Streaming conversations via OpenRouter with plan-based model routing, prompt caching, and provider latency routing
-   **RAG System** - Knowledge retrieval using pgvector embeddings with intent gating to avoid unnecessary retrieval
-   **Web Search Tools** - TinyFish search/fetch tools for current external information
-   **Session Management** - Intelligent context building with automatic summarization
-   **Persistent Memory** - AI remembers user preferences and important information
-   **Automated Maintenance** - Background jobs for memory consolidation and profile analysis via QStash
-   **Multi-Channel** - Web, Telegram, and WhatsApp support with unified user identity
-   **Rate Limiting** - Usage tracking with subscription tiers
-   **Authentication** - Secure auth with Clerk

## 🚀 Quick Start

Use Bun 1.3.5, the version pinned in the CI and migration workflows. Node.js is
not required for this Bun-based workflow; if you run the toolchain with Node
instead, use a version supported by Prisma 7.2: `^20.19`, `^22.12`, or
`>=24.0`.

```bash
# Install dependencies
bun install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
bunx prisma migrate dev

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Documentation

| Document                                     | Description                                |
| -------------------------------------------- | ------------------------------------------ |
| [Getting Started](./docs/getting-started.md) | Setup + user/admin runbook (non-technical) |
| [Architecture](./docs/architecture.md)       | System architecture and project structure  |
| [Database](./docs/database.md)               | Prisma schema and data models              |
| [AI System](./docs/ai-system.md)             | Orchestrator, RAG, sessions, and memory    |
| [Maintenance](./docs/maintenance.md)         | Automated jobs and QStash integration      |
| [API Reference](./docs/api.md)               | REST API endpoints documentation           |
| [Authentication](./docs/authentication.md)   | Clerk integration and user roles           |
| [Rate Limiting](./docs/rate-limiting.md)     | Usage limits and subscription tiers        |
| [Organizations](./docs/organizations.md)     | B2B contracts, seats, and Clerk org sync   |
| [Guest Migration](./docs/guest-migration.md) | Guest-to-registered migration flow          |
| [Telegram Webhook](./docs/telegram-webhook.md) | Telegram bot webhook processing          |
| [WhatsApp Webhook](./docs/whatsapp-webhook.md) | WhatsApp Cloud API webhook processing    |
| [QA Test Plan](./docs/qa-test-plan.md)       | Test scope, execution flow, and bug reporting |

## 🛠 Tech Stack

-   **Framework:** Next.js 16 (App Router)
-   **Language:** TypeScript
-   **Database:** PostgreSQL + Prisma + pgvector
-   **AI:** Vercel AI SDK v7 + OpenRouter + TinyFish web tools
-   **Job Queue:** Upstash QStash
-   **Auth:** Clerk
-   **Styling:** Tailwind CSS + Radix UI + Framer Motion

## 📁 Project Structure

```
anthon-2.0/
├── src/
│   ├── app/           # Next.js App Router pages
│   │   ├── (marketing)/ # Public pages
│   │   ├── (chat)/      # Chat interface
│   │   ├── (admin)/     # Admin dashboard
│   │   └── api/         # API routes
│   ├── components/    # Shared UI components
│   ├── lib/           # Core business logic
│   │   ├── ai/        # AI orchestrator, RAG, sessions
│   │   └── ...        # Auth, rate-limit, utils
│   └── hooks/         # React hooks
├── prisma/            # Database schema & migrations
├── docs/              # Documentation
└── public/            # Static assets
```

## 📜 Scripts

| Script           | Description              |
| ---------------- | ------------------------ |
| `bun run dev`    | Start development server |
| `bun run build`  | Build for production     |
| `bun run vercel:build` | Vercel production build: migrate, generate Prisma client, and build |
| `bun run lint`   | Run Biome check          |
| `bun run typecheck` | Run TypeScript checks without emitting files |
| `bun run verify` | Run lint, typecheck, and unit tests |
| `bun run format` | Format code with Biome   |
| `bun run test`   | Run unit tests (Vitest)  |
| `bun run test:integration` | Run integration tests (real DB) |
| `bun run test:coverage:unit` | Run unit coverage |
| `bun run test:coverage:integration` | Run integration coverage |
| `bun run test:coverage` | Run unit + integration coverage |
| `bun run test:all` | Run unit + integration + coverage |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:ui` | Run tests with Vitest UI |

## 🪵 Logging

Server logging is centralized in `src/lib/logger` and emits structured events.

- `development` / local default level: `info`
- `test` default level: `silent`
- `production` default level: `error` (critical errors only)
- `development` / local default format: `pretty`
- `test` and `production` default format: `json`

Optional env overrides:

- `APP_LOG_LEVEL` = `silent|error|warn|info|debug`
- `APP_LOG_FORMAT` = `pretty|json`
- `APP_LOG_COLORS` = `true|false` (TTY pretty output)
- `APP_LOG_DOMAIN_LEVELS` = `domain:level,domain:level` (example: `auth:warn,latency:error`)
- `APP_LOG_EXCLUDE_EVENTS` = comma separated event filters, supports `*` suffix (example: `auth.authenticated,latency.*`)
- `ENABLE_LATENCY_LOGS=true` to keep latency timing logs enabled (including prod troubleshooting)

## Neon Branch Mapping

For safe environment separation:

- Use Neon `development` branch for `TEST_DATABASE_URL` (integration tests).
- Use Neon `production` branch for the deployed `DATABASE_URL`.
- Store that branch's direct connection string as the Production-only
  `DIRECT_DATABASE_URL` variable in Vercel. It is used only by the production
  build to apply pending Prisma migrations.

## 📄 License

Private - All rights reserved
