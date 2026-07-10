# Anthon 2.0

Anthon is a multi-channel sports performance coaching application. It combines streaming AI chat, persistent user context, retrieval-augmented generation, guest onboarding, plan-based entitlements, and web, Telegram, and WhatsApp delivery.

## What is in the repository

- Streaming web chat for signed-in and guest users
- Telegram and WhatsApp webhook adapters with account linking
- Shared AI orchestration, message persistence, usage accounting, and model routing
- Profile, preferences, memories, session summaries, and a pgvector knowledge base
- Personal plans plus Clerk-backed organization contracts and seat limits
- File uploads through Vercel Blob and optional ElevenLabs voice output
- Admin analytics, users, organizations, RAG, costs, jobs, voice, and benchmark tools
- QStash-backed maintenance jobs and Vercel attachment cleanup

## Architecture at a glance

All four chat entry points converge on the same channel runtime:

```text
Web / Guest Web / Telegram / WhatsApp
                 |
          channel adapters
                 |
          runChannelFlow()
                 |
     AI orchestrator + tools + RAG
                 |
 assistant persistence + usage tracking
                 |
       PostgreSQL / pgvector
```

Channel adapters own authentication, inbound media, and outbound delivery. `src/lib/channel-flow` owns the shared generation and persistence boundary. See [Architecture](./docs/architecture.md) for the full flow.

## Quick start

Prerequisites:

- Node.js 22 LTS, version 22.12 or newer in the 22.x line. Prisma also supports Node 20.19.x and Node 24+.
- [Bun](https://bun.sh/) as the canonical package manager
- PostgreSQL with the `vector` extension, or a Neon branch with pgvector
- Clerk, OpenRouter, Tavily, and PostHog project credentials for working chat

Configure the environment before installing because the post-install step generates the Prisma client:

```bash
cp .env.example .env
# Fill the core values in .env. Use a development database, never production.

bun install --frozen-lockfile
```

Enable pgvector in the development database, then apply migrations:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
bunx prisma migrate dev
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The complete variable matrix and feature-specific integrations are in [Configuration](./docs/configuration.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [Documentation index](./docs/README.md) | Guide to all current reference docs |
| [Getting started](./docs/getting-started.md) | Local developer setup and first-run checks |
| [Configuration](./docs/configuration.md) | Environment variables grouped by feature |
| [Architecture](./docs/architecture.md) | Runtime boundaries and request/data flows |
| [AI system](./docs/ai-system.md) | Orchestrator, RAG, tools, sessions, and model routing |
| [Database](./docs/database.md) | Prisma models, pgvector, and environment mapping |
| [API reference](./docs/api.md) | Route inventory, authentication, and payloads |
| [Authentication](./docs/authentication.md) | Clerk, guest sessions, proxy, roles, and webhooks |
| [Rate limiting](./docs/rate-limiting.md) | Plans, usage accounting, and effective entitlements |
| [Organizations](./docs/organizations.md) | B2B contracts, memberships, seats, and audit logs |
| [Maintenance](./docs/maintenance.md) | QStash jobs, cron endpoints, and current schedules |
| [Deployment](./docs/deployment.md) | Database-scoped migrations and release safeguards |
| [User guide](./docs/user-guide.md) | Web, channel-linking, and admin UI guide |

Telegram, WhatsApp, guest migration, and QA have dedicated references in the [documentation index](./docs/README.md).

## Developer commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the Next.js development server. |
| `bun run lint` | Run Biome checks. |
| `bun run format` | Rewrite supported files with Biome. |
| `bunx tsc --noEmit` | Run the TypeScript checker. |
| `bun run test` | Run unit tests; integration files are excluded. |
| `bun run test:watch` | Run unit tests in watch mode. |
| `bun run test:ui` | Start the Vitest UI. |
| `bun run test:integration` | Run route integration tests against `TEST_DATABASE_URL`. |
| `bun run test:coverage` | Run unit and integration coverage suites. |
| `bun run test:all` | Run unit/integration tests, then both coverage suites. |
| `bun run knip` | Report unused files, exports, and dependencies. |
| `bun run analyze` | Run the Next.js experimental bundle analyzer. |
| `bun run build` | Generate Prisma and build Next.js without applying migrations. |
| `bun run db:migrate:deploy` | Apply pending migrations to the configured database. |
| `bun run start` | Start an already-built production server. |

### Database-changing commands

- `bunx prisma migrate dev` creates/applies development migrations against the configured database.
- `bun run db:migrate:deploy` applies pending migrations to the current environment and must be run explicitly before a compatible application release.
- `bun run test:integration` and `bun run test:coverage:integration` create pgvector if needed and run `prisma db push` against `TEST_DATABASE_URL`.
- `bun run test:coverage` includes the integration coverage command.
- `bun run test:all` executes the integration suite twice: once directly and once through coverage.

Read [Deployment and Database Safety](./docs/deployment.md) before running these commands against shared infrastructure.

## Main technology choices

- Next.js 16 App Router, React 19, and TypeScript
- Bun for dependency and script execution
- PostgreSQL, Prisma 7, and pgvector
- Vercel AI SDK 6 and OpenRouter
- Clerk authentication, billing synchronization, and organizations
- Tailwind CSS, Radix UI primitives, and Framer Motion
- Upstash QStash, Vercel Blob, PostHog, Tavily, and ElevenLabs

## License

Private - All rights reserved.
