# Project Agent Instructions

Instructions for automated development sessions working in this repository.

## Project Focus

Anthon 2.0 is an AI coaching chat application built with Next.js 16 App Router.

Current product priorities:

1. AI chat experience and reliability.
2. Web, Telegram, and WhatsApp channel flows.
3. Conversation memory, RAG, session handling, and streaming behavior.

When work touches multiple areas, prioritize correctness and regression coverage for chat and channels before admin, marketing, or secondary dashboards.

## Commands

Prefer `bun run` over `npm run` and `bunx` over `npx` unless a tool specifically requires npm/npx.

```bash
# Development
bun run dev              # Start dev server
bun run build            # Prisma generate + migrations deploy + Next build
bun run lint             # Biome check
bun run format           # Biome format --write

# Testing
bun run test                         # Unit tests
bun run test:integration             # Integration tests, requires TEST_DATABASE_URL
bun run test:coverage:unit           # Unit coverage
bun run test:coverage:integration    # Integration coverage
bun run test:all                     # Unit + integration + coverage

# Database
bunx prisma generate
bunx prisma migrate dev
bunx prisma db seed

# Code analysis
bun run knip
bun run analyze
```

For a single Vitest file:

```bash
bunx vitest run path/to/file.test.ts
```

## Architecture Map

- `src/app/(marketing)/` - public pages.
- `src/app/(chat)/` - authenticated chat UI.
- `src/app/(admin)/` - admin dashboard.
- `src/app/api/` - API routes and webhooks.
- `src/lib/ai/` - orchestrator, RAG, sessions, memory, token/cost logic.
- `src/lib/channels/` - Web, Telegram, WhatsApp channel handling.
- `src/lib/rate-limit/` - plan-based usage checks.
- `src/lib/organizations/` - Clerk organization sync and B2B contracts.
- `src/lib/maintenance/` - QStash background jobs.
- `prisma/` - schema, migrations, and seed.
- `docs/` - feature and subsystem documentation.

Important AI/chat files:

- `src/lib/ai/orchestrator.ts`
- `src/lib/ai/session-manager.ts`
- `src/lib/ai/rag.ts`
- `src/lib/ai/memory-extractor.ts`
- `src/lib/ai/tools/`
- `src/lib/channels/web/`
- `src/lib/channels/telegram/`
- `src/lib/channels/whatsapp/`
- `src/app/api/chat/`
- `src/app/api/webhooks/telegram/`
- `src/app/api/webhooks/whatsapp/`

## Conventions

- Use TypeScript and the existing `@/*` path alias.
- Use Biome, not ESLint or Prettier.
- Keep 2-space indentation and let Biome organize imports.
- Route handlers should use `Request` unless the local code requires `NextRequest`.
- Unit tests live in `*.test.ts` or `*.test.tsx` near source files.
- Integration tests live as `*.integration.test.ts` under `src/app/api/`.
- Logging goes through `src/lib/logger/`; do not add ad hoc production `console.log`.
- Secret values in `.env` may be read when needed to run, debug, or verify the app. Do not print or copy secret values into logs, commits, issues, or documentation.

## Next.js 16 Rule

This project carries local Next.js documentation in `.next-docs/`.

Before changing Next.js routing, caching, Server Components, route handlers, metadata, middleware/proxy, or build config, read the relevant local docs first. Do not rely on older Next.js assumptions.

If `.next-docs/` is missing, regenerate local framework docs before making framework-specific changes.

```bash
bunx @next/codemod agents-md --output CLAUDE.md
```

## Prisma Changes

When modifying `prisma/schema.prisma`:

1. Validate the schema.
2. Run `bunx prisma generate`.
3. Use `bunx prisma migrate dev` for migration-backed schema changes.
4. Use `bunx prisma db push` only for rapid local experiments where a migration is intentionally not being created.
5. Add or update tests for behavior that depends on the schema change.

Runtime DB URLs:

- `DATABASE_URL` is the pooled runtime connection.
- `DIRECT_DATABASE_URL` is the direct migration connection.
- `TEST_DATABASE_URL` is used by integration tests.

## Verification Expectations

For most code changes, run:

```bash
bun run lint
bun run test
```

For chat or AI changes, run targeted tests around:

- `src/app/api/chat/`
- `src/lib/ai/`
- `src/lib/channels/web/`

For Telegram or WhatsApp changes, run the relevant webhook/channel tests and any shared channel-flow tests.

For schema, auth, billing, or cross-route behavior, consider `bun run test:integration` when the required database is available.

For frontend chat UI changes, verify the page in a browser when a dev server can run.

## Git Rules

- Always use conventional commit messages when committing.
- Commit autonomously at the end of completed tasks when changes are verified.
- Pull requests are not required by default.
- Do not revert user changes unless explicitly requested.
- Before editing existing modified files, ask for confirmation if the change could overwrite or reinterpret user-owned work.
- Branches may be created for important or multi-step work.
- Do not use tool branding or assistant names in branch names, commit messages, public repo text, or user-facing product copy.

## Deployment Rules

- Deployments may be performed autonomously after verification when they are directly tied to a completed task.
- Use preview/development deployments for validation unless production deployment is explicitly appropriate.
- Do not promote risky database, auth, billing, or channel changes without confirming the intended target environment.

## Environment And Integrations

The app can use these external systems:

- Clerk for authentication and organizations.
- OpenRouter for AI model access.
- Tavily for optional web search.
- PostgreSQL/Neon with pgvector.
- Upstash QStash for maintenance queues.
- Vercel Blob for uploads.
- Telegram Bot API.
- WhatsApp Cloud API.
- ElevenLabs for voice.
- PostHog for analytics.

When an integration is unavailable locally, mock at the boundary used by existing tests instead of weakening production code.

Current integration policy:

- GitHub, Vercel, and Neon may be used when useful for the task.
- Clerk integration requires credentials or access details from the project owner before live work.
- OpenRouter, Telegram, and WhatsApp live integrations are not a priority for agent setup right now; keep using existing mocks/tests unless explicitly asked.
- Other systems should be integrated gradually as needed.
