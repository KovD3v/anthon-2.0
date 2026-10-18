# Project Agent Instructions

Instructions for automated development sessions working in this repository.

## Project Focus

Anthon 2.0 is an AI coaching chat application built with Next.js 16 App Router.

Current product priorities:

1. AI chat experience and reliability.
2. Web, Telegram, and WhatsApp channel flows.
3. Conversation memory, RAG, session handling, and streaming behavior.

When work touches multiple areas, prioritize correctness and regression coverage for chat and channels before admin, marketing, or secondary dashboards.

## Product Decisions

Before planning or changing product behavior, read `CONTEXT.md` completely and then read the relevant records in `docs/adr/`. This applies to coaching scope, coached-person identity, performance contexts, memory, plans, organizations, channels, notifications, age rules, analytics, administrator access, and data lifecycle.

Use `CONTEXT.md` as the language contract and active ADRs as product requirements. If a request or existing implementation conflicts with them, identify the conflict before editing code. A later ADR that explicitly supersedes an earlier one is authoritative.

## Commands

Prefer `bun run` over `npm run` and `bunx` over `npx` unless a tool specifically requires npm/npx.

```bash
# Development
bun run dev              # Start dev server
bun run build            # Prisma generate + Next build (artifact-only)
bun run vercel:build     # Vercel production: migrations deploy + build
bun run lint             # Biome check
bun run format           # Biome format --write

# Testing
bun run test                         # Unit tests
bun run test:integration             # Integration tests on an ephemeral Neon branch
bun run test:emulate                 # Clerk + Vercel Blob flows against local Emulate, offline
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
- Emulate tests live as `*.emulate.test.ts` near source files.
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
- Integration tests require `NEON_API_KEY` and `NEON_PROJECT_ID`. The runner
  derives an ephemeral branch from the development `DATABASE_URL` and injects
  `TEST_DATABASE_URL` only into the test process.

## Verification Expectations

For security or dependency changes, run `scripts/semgrep-scan.sh` (metrics are disabled) and verify each finding before proposing a fix.

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

For changes to Clerk Backend API calls, `src/proxy.ts` session handling, or Vercel Blob calls, run `bun run test:emulate`.

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

### Local service emulation (Emulate)

[vercel-labs/emulate](https://github.com/vercel-labs/emulate) runs stateful local
copies of the Clerk Backend API and the Vercel Blob API. The SDKs reach it only
through their own variables (`CLERK_API_URL`, `VERCEL_BLOB_API_URL`), so
production code paths do not change.

Use it when a test should exercise the real SDK over HTTP instead of a
`vi.mock`, because mocks can encode the wrong SDK contract. Emulate caught one:
`deleteClerkOrganization` passed an object where the SDK expects the id string.

- `bun run test:emulate` starts both emulators in Vitest global setup
  (`src/test/emulate/`), sets the SDK variables, and runs `*.emulate.test.ts`.
  It needs no network, credentials, or database; mock `@/lib/db` in these tests.
- `bun run emulate` keeps the same emulators on ports 4011 (Clerk) and 4000
  (Blob) and prints the variables, for ad-hoc scripts or `curl`.

Limits; keep the existing approach for each:

- Stripe: Emulate has no subscriptions, invoices, recurring prices, Elements
  checkout sessions (`ui_mode`, `client_secret`), and its webhook events lack
  `id` and `livemode`, so anthon's webhook route rejects them. Keep Stripe test
  mode with `bun run dev:stripe-test` (Stripe CLI listener) and
  `bun run billing:verify-test`.
- Clerk: only the Backend API and session-token JWKS are emulated. There is no
  Frontend API, so browser sign-in with Clerk components does not work against
  it; browser flows keep the E2E session cookie (`bun run test:e2e`). Clerk
  webhooks (Svix) are not emulated.
- Emulate 0.12 sends `application/json; charset=UTF-8`, which
  `@clerk/backend` reads as text. `src/test/emulate/services.ts` puts a small
  proxy in front of Clerk that restores `application/json`. Remove it once
  Emulate sends the bare type.
- Blob URLs are `http://localhost:4000/blob/...`, not
  `*.private.blob.vercel-storage.com`, so the private voice-store URL checks in
  `src/lib/voice/storage.ts` reject them. Multipart and client uploads are not
  emulated.
- QStash, Neon, OpenRouter, Telegram, and WhatsApp are not covered by Emulate.
- A passing Emulate test shows that anthon calls the SDK correctly. It does not
  prove the real service behaves the same; verify billing and auth changes in
  the real test environments before release.

Current integration policy:

- GitHub, Vercel, and Neon may be used when useful for the task.
- Clerk integration requires credentials or access details from the project owner before live work.
- OpenRouter, Telegram, and WhatsApp live integrations are not a priority for agent setup right now; keep using existing mocks/tests unless explicitly asked.
- Other systems should be integrated gradually as needed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
