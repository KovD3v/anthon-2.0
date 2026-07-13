# Anthon 2.0 Documentation

Welcome to the Anthon 2.0 documentation. Anthon is an AI-powered coaching chat application built with Next.js 16, featuring intelligent conversation management, RAG-based knowledge retrieval, and multi-channel support.

## 📚 Documentation Index

| Document                                | Description                                  |
| --------------------------------------- | -------------------------------------------- |
| [Getting Started](./getting-started.md) | Setup + user/admin runbook (non-technical)   |
| [Architecture](./architecture.md)       | System architecture and project structure    |
| [Database](./database.md)               | Prisma schema and data models                |
| [AI System](./ai-system.md)             | Orchestrator, routing, tools, RAG, sessions, and memory |
| [Maintenance](./maintenance.md)         | Automated jobs, cron trigger, and QStash queues |
| [API Reference](./api.md)               | REST API endpoints documentation             |
| [Authentication](./authentication.md)   | Clerk integration and user roles             |
| [Rate Limiting](./rate-limiting.md)     | Usage limits and subscription tiers          |
| [Organizations](./organizations.md)     | B2B contracts, seats, and entitlement model  |
| [Guest Migration](./guest-migration.md) | Guest to registered user data migration      |
| [Telegram Webhook](./telegram-webhook.md) | Telegram bot webhook flow                  |
| [WhatsApp Webhook](./whatsapp-webhook.md) | WhatsApp Cloud API webhook flow            |
| [Private Voice Storage](./voice-storage.md) | Private web voice upload, delivery, and retention policy |
| [QA Test Plan](./qa-test-plan.md)       | Test checklist, execution process, and GitHub issue workflow |

## 🛠 Technology Stack

| Category           | Technology                         |
| ------------------ | ---------------------------------- |
| **Framework**      | Next.js 16 (App Router)            |
| **Language**       | TypeScript                         |
| **Database**       | PostgreSQL with Prisma ORM         |
| **Vector Search**  | pgvector for RAG embeddings        |
| **Authentication** | Clerk                              |
| **AI Provider**    | OpenRouter with plan-based model routing |
| **AI SDK**         | Vercel AI SDK v7                   |
| **Web Search**     | TinyFish search and fetch tools     |
| **Styling**        | Tailwind CSS                       |
| **UI Components**  | Radix UI, Framer Motion            |

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Setup environment variables
cp .env.example .env

# Run database migrations
bunx prisma migrate dev

# Start development server
bun run dev
```

See [Getting Started](./getting-started.md) for detailed setup instructions.
