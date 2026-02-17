# Anthon 2.0

An AI-powered coaching chat application built with Next.js 16, featuring intelligent conversation management, RAG-based knowledge retrieval, and multi-channel support.

## ✨ Features

-   **AI Coaching Chat** - Streaming conversations with GPT-4.1 and Gemini via OpenRouter
-   **RAG System** - Knowledge retrieval using pgvector embeddings (Gemini 2.0 Flash classification)
-   **Session Management** - Intelligent context building with automatic summarization
-   **Persistent Memory** - AI remembers user preferences and important information
-   **Automated Maintenance** - Background jobs for memory consolidation and profile analysis via QStash
-   **Multi-Channel** - Web and WhatsApp support with unified user identity
-   **Rate Limiting** - Usage tracking with subscription tiers
-   **Authentication** - Secure auth with Clerk

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
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

## 🛠 Tech Stack

-   **Framework:** Next.js 16 (App Router)
-   **Language:** TypeScript
-   **Database:** PostgreSQL + Prisma + pgvector
-   **AI:** Vercel AI SDK v6 + OpenRouter
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
| `npm run dev`    | Start development server |
| `npm run build`  | Build for production     |
| `npm run lint`   | Run Biome linter         |
| `npm run format` | Format code with Biome   |
| `npm run test`   | Run unit tests (Vitest)  |
| `npm run test:integration` | Run integration tests (real DB) |
| `npm run test:coverage` | Run tests with coverage + thresholds |
| `npm run test:all` | Run unit + integration + coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Run tests with Vitest UI |

Test command equivalents:

- `npm run test` (canonical)
- `bun run test`
- `bun run test:integration`
- `bun run test:coverage`
- `bun run test:all`

## Neon Branch Mapping

For safe environment separation:

- Use Neon `development` branch for `TEST_DATABASE_URL` (integration tests).
- Use Neon `production` branch for deployed `DATABASE_URL` and `DIRECT_DATABASE_URL`.

## 📄 License

Private - All rights reserved
