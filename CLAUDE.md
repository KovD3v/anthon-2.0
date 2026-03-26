# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build (runs Prisma migrations + Next.js compile)
npm run lint             # Biome linter
npm run format           # Biome formatter

# Database
npx prisma migrate dev   # Run migrations (dev)
npx prisma db seed       # Seed database (npx tsx prisma/seed.ts)

# Testing
npm run test                         # Unit tests (Vitest)
npm run test:watch                   # Watch mode
npm run test:ui                      # Vitest UI dashboard
npm run test:integration             # Integration tests (requires real DB via TEST_DATABASE_URL)
npm run test:coverage:unit           # Unit tests + coverage thresholds
npm run test:coverage:integration    # Integration coverage (admin/organizations routes only)
npm run test:all                     # Full suite (unit + integration + coverage)

# Single test file
npx vitest run src/lib/ai/rag.test.ts

# Code analysis
npm run knip             # Check for unused exports
npm run analyze          # Next.js bundle analysis
```

All scripts work with `bun run` as well as `npm run`.

## Architecture Overview

**Anthon 2.0** is an AI coaching chat application built on Next.js 16 App Router. The codebase is organized around a few major subsystems:

### Route Groups
- `src/app/(marketing)/` — Public landing pages
- `src/app/(chat)/` — Authenticated chat interface
- `src/app/(admin)/` — Admin dashboard
- `src/app/api/` — 165+ API route handlers

### Core AI Subsystem (`src/lib/ai/`)
The central intelligence layer:
- **`orchestrator.ts`** — Entry point for all chat requests; builds system prompt, invokes tools, handles streaming
- **`session-manager.ts`** — Groups messages into sessions (15-min gap = new session), triggers summarization at token limits
- **`rag.ts`** — Retrieval-Augmented Generation; semantic search via pgvector embeddings
- **`memory-extractor.ts`** — Extracts facts/preferences from conversations, persists to `Memory` model
- **`cost-calculator.ts`** — Token counting and cost tracking per message

AI uses Vercel AI SDK v6 with OpenRouter (Gemini 2.0 Flash family) as the primary provider.

### Multi-Channel Support (`src/lib/channels/`)
Unified user identity across Web, Telegram, and WhatsApp. Each channel has its own webhook handler under `src/app/api/webhooks/`. Channel identities are linked via one-time tokens stored in `ChannelLinkToken`.

### Rate Limiting (`src/lib/rate-limit/`)
Plan-based limits enforced per-user and per-organization. Config lives in `config.ts`; enforcement in `checker.ts`; usage persisted to `DailyUsage` model.

### B2B Organizations (`src/lib/organizations/`)
Clerk organization sync with custom contract system (`OrganizationContract`) that defines plan tiers and seat limits. Includes full audit logging.

### Background Jobs (`src/lib/maintenance/`)
QStash-powered async jobs for memory consolidation, profile analysis, and document indexing. Job endpoints live under `src/app/api/queues/`.

### Database
PostgreSQL via Prisma 7 with pgvector extension for embeddings. Two connection URLs are required:
- `DATABASE_URL` — pooled connection (runtime)
- `DIRECT_DATABASE_URL` — direct connection (migrations)

Use Neon `development` branch for `TEST_DATABASE_URL` (integration tests), `production` branch for deployed URLs.

## Key Conventions

- **Path alias:** `@/*` maps to `./src/*`
- **Linter/formatter:** Biome (not ESLint/Prettier) — 2-space indent, auto import organization
- **Tests:** Unit tests in `*.test.ts` alongside source files; integration tests in `*.integration.test.ts` under `src/app/api/`
- **Coverage thresholds:** Unit — 80% statements/lines/functions, 75% branches; Integration — 35% baseline (admin/organizations only)
- **Logging:** Centralized in `src/lib/logger/`; domain-level filtering via `APP_LOG_DOMAIN_LEVELS`; default levels: dev=`info`, test=`silent`, prod=`error`
- **API routes:** Use `Request` (not `NextRequest`) in route handlers
