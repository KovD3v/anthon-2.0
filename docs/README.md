# Anthon 2.0 Documentation

These documents describe the current repository behavior. Start with the path that matches your task.

## Start here

| If you want to... | Read |
| --- | --- |
| Run the app locally | [Getting Started](./getting-started.md) |
| Configure an integration | [Configuration](./configuration.md) |
| Understand the system | [Architecture](./architecture.md) |
| Use the product or admin UI | [User Guide](./user-guide.md) |
| Deploy or run database-changing commands | [Deployment and Database Safety](./deployment.md) |
| Test a release manually | [QA Test Plan](./qa-test-plan.md) |

## System references

| Document | Scope |
| --- | --- |
| [AI System](./ai-system.md) | Orchestration, tools, RAG, sessions, models, and metrics |
| [Database](./database.md) | Prisma schema, pgvector, identities, messages, billing, and benchmarks |
| [API Reference](./api.md) | User, guest, admin, operational, queue, and webhook routes |
| [Authentication](./authentication.md) | Clerk sessions, guest cookies, proxy gates, roles, and sync |
| [Rate Limiting](./rate-limiting.md) | Canonical plans, UTC usage, and entitlement selection |
| [Organizations](./organizations.md) | Contracts, memberships, ownership, seat enforcement, and audit |
| [Guest Migration](./guest-migration.md) | Transactional guest-to-account merge behavior |

## Operations and integrations

| Document | Scope |
| --- | --- |
| [Maintenance](./maintenance.md) | QStash consumers, cron triggers, retention, and scheduling status |
| [Telegram Webhook](./telegram-webhook.md) | Bot ingress, media, linking, delivery, and debug flags |
| [WhatsApp Webhook](./whatsapp-webhook.md) | Meta webhook verification, media, linking, and delivery |
| [Deployment](./deployment.md) | Vercel builds, migrations, environment isolation, and release checks |

## Sources of truth

The docs intentionally point to a small number of code-level sources of truth:

| Concern | Source |
| --- | --- |
| Routes | `src/app/**/page.tsx` and `src/app/api/**/route.ts` |
| Shared channel execution | `src/lib/channel-flow/` |
| AI behavior | `src/lib/ai/orchestrator.ts`, `src/lib/ai/constants.ts` |
| Plans and model routing | `src/lib/plans/catalog.ts`, `src/lib/plans/resolver.ts` |
| Data model | `prisma/schema.prisma` and `prisma/migrations/` |
| Auth boundaries | `src/proxy.ts`, `src/lib/auth.ts`, route/layout checks |
| Scheduled work | `vercel.json`, `src/app/api/cron/`, `src/app/api/queues/` |
| Environment usage | `.env.example` and `process.env` references in `src/` |

Files under `docs/superpowers/` and `plans/` are dated design/implementation artifacts. Treat the references above as current when historical documents disagree.
