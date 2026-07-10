# Getting Started

This guide sets up Anthon for local development. It assumes a development database and Bun as the canonical package manager.

## Prerequisites

- Node.js 22 LTS recommended, version 22.12 or newer in the 22.x line. Prisma also supports Node 20.19.x and Node 24+.
- Bun
- PostgreSQL 15+ with the `vector` extension, or a Neon development branch
- Clerk application
- OpenRouter, Tavily, and PostHog project credentials

Vercel Blob, QStash, Telegram, WhatsApp, and ElevenLabs are only needed when working on those features, although QStash's module-level validation can affect routes/builds that import it.

## 1. Clone and configure

```bash
git clone <repository-url>
cd anthon-2.0
cp .env.example .env
```

Fill at least these variables before installing:

```env
DATABASE_URL="<development pooled PostgreSQL URL>"
DIRECT_DATABASE_URL="<development direct PostgreSQL URL>"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
OPENROUTER_API_KEY="sk-or-..."
TAVILY_API_KEY="tvly-..."
POSTHOG_API_KEY="phc_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Use a development database locally. Production URLs belong only in the production deployment environment. See [Configuration](./configuration.md) for every variable and [Deployment](./deployment.md) for environment mapping.

## 2. Install dependencies

```bash
bun install --frozen-lockfile
```

The `postinstall` script generates the Prisma client.

## 3. Prepare the database

Enable pgvector in the development database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Apply the migrations and regenerate the client when needed:

```bash
bunx prisma migrate dev
bunx prisma generate
```

Optional seed data:

```bash
bunx prisma db seed
```

## 4. Start the application

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). `/chat` supports both signed-in users and cookie-backed guests; guest file uploads, memory extraction, and voice output are disabled.

## 5. Verify the local baseline

These checks do not intentionally change an external database:

```bash
bun run lint
bunx tsc --noEmit
bun run test
```

`bun run knip` audits unused code and dependencies. Standalone scripts must be configured as Knip entry points if they are intentionally retained.

## Integration tests

Set `TEST_DATABASE_URL` to an isolated, disposable database, then run:

```bash
bun run test:integration
```

Warning: the bootstrap creates the `vector` extension and runs `prisma db push` against `TEST_DATABASE_URL`. It refuses to use the same database host as `DATABASE_URL`, but you must still verify the target yourself.

Coverage commands:

```bash
bun run test:coverage:unit
bun run test:coverage:integration
bun run test:coverage
```

`test:coverage:integration` and the aggregate `test:coverage` command run the same database-mutating integration bootstrap. `bun run test:all` runs unit and integration tests first, then repeats both through the coverage commands.

## Production build

```bash
bun run build
bun run start
```

This generates Prisma Client and compiles Next.js without changing the database. For a deployment containing migrations, verify the target URLs and run `bun run db:migrate:deploy` as an explicit release step before promoting the compatible application. Read [Deployment and Database Safety](./deployment.md) first.

## Common setup failures

| Symptom | Likely cause |
| --- | --- |
| `TAVILY_API_KEY environment variable is required` | Tavily is validated when the AI tool module loads. Add a real key. |
| `POSTHOG_API_KEY is not set` when sending a chat | Server-side AI tracing is initialized for every generated response. |
| `QStash environment variables missing` | The requested page/route imports the QStash module. Configure QStash or avoid that feature locally. |
| PostgreSQL reports unknown type `vector` | Enable the pgvector extension before migrations. |
| Prisma connects to the wrong database | Check both `DATABASE_URL` and `DIRECT_DATABASE_URL`; Prisma CLI prefers the direct URL. |

## Next steps

- [Architecture](./architecture.md)
- [Configuration](./configuration.md)
- [AI System](./ai-system.md)
- [Database](./database.md)
- [User Guide](./user-guide.md)
