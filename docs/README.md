# Anthon 2.0 Documentation

Welcome to the Anthon 2.0 documentation. Anthon is an AI-powered coaching chat application built with Next.js 16, featuring intelligent conversation management, RAG-based knowledge retrieval, and multi-channel support.

## 📚 Documentation Index

| Document                                | Description                                  |
| --------------------------------------- | -------------------------------------------- |
| [Getting Started](./getting-started.md) | Setup, installation, and running the project |
| [Architecture](./architecture.md)       | System architecture and project structure    |
| [Database](./database.md)               | Prisma schema and data models                |
| [AI System](./ai-system.md)             | Orchestrator, RAG, sessions, and memory      |
| [API Reference](./api.md)               | REST API endpoints documentation             |
| [Authentication](./authentication.md)   | Clerk integration and user roles             |
| [Rate Limiting](./rate-limiting.md)     | Usage limits and subscription tiers          |

## 🛠 Technology Stack

| Category           | Technology                         |
| ------------------ | ---------------------------------- |
| **Framework**      | Next.js 16 (App Router)            |
| **Language**       | TypeScript                         |
| **Database**       | PostgreSQL with Prisma ORM         |
| **Vector Search**  | pgvector for RAG embeddings        |
| **Authentication** | Clerk                              |
| **AI Provider**    | OpenRouter (GPT-4.1, Gemini, Qwen) |
| **AI SDK**         | Vercel AI SDK v5                   |
| **Styling**        | Tailwind CSS                       |
| **UI Components**  | Radix UI, Framer Motion            |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

See [Getting Started](./getting-started.md) for detailed setup instructions.
