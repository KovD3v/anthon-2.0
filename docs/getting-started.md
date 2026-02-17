# Getting Started

This guide will help you set up and run Anthon 2.0 locally.

## Prerequisites

-   **Node.js** 18.17 or later
-   **PostgreSQL** 15+ with [pgvector](https://github.com/pgvector/pgvector) extension
-   **Clerk account** for authentication ([clerk.com](https://clerk.com))
-   **OpenRouter API key** for AI models ([openrouter.ai](https://openrouter.ai))

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd anthon-2.0
```

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Environment Variables

Create `.env` from the template:

```bash
cp .env.example .env
```

Minimum variables to run the web app:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/anthon?schema=public"
DIRECT_DATABASE_URL="postgresql://user:password@localhost:5432/anthon?schema=public"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."
OPENROUTER_API_KEY="sk-or-..."
```

Feature-specific variables:

- Uploads: `BLOB_READ_WRITE_TOKEN`
- Maintenance jobs: `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`, `APP_URL`
- Telegram channel: `TELEGRAM_*`
- WhatsApp channel: `WHATSAPP_*`
- Voice generation: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

`NEXT_PUBLIC_APP_URL` is used for link generation (channel linking, embedding headers, callbacks).

`TEST_DATABASE_URL` is required for `npm run test:integration` and should point to a non-production database/branch.

Neon branch mapping (recommended):

- `TEST_DATABASE_URL` -> `development` branch (direct connection string)
- Production deployment `DATABASE_URL` -> `production` branch (pooled connection string)
- Production deployment `DIRECT_DATABASE_URL` -> `production` branch (direct connection string)

Useful Neon CLI commands:

```bash
neon cs development --project-id <project_id> --database-name neondb --role-name neondb_owner
neon cs development --project-id <project_id> --database-name neondb --role-name neondb_owner --pooled
neon cs production --project-id <project_id> --database-name neondb --role-name neondb_owner
neon cs production --project-id <project_id> --database-name neondb --role-name neondb_owner --pooled
```

### 4. Database Setup

Ensure PostgreSQL is running with pgvector extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

### 5. Seed Database (Optional)

```bash
npx prisma db seed
```

## Running the Application

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Available Scripts

| Script           | Description              |
| ---------------- | ------------------------ |
| `npm run dev`    | Start development server |
| `npm run build`  | Build for production     |
| `npm start`      | Start production server  |
| `npm run lint`   | Run Biome linter         |
| `npm run format` | Format code with Biome   |
| `npm run test`   | Run unit tests (Vitest)  |
| `npm run test:integration` | Run integration tests (real DB) |
| `npm run test:coverage:unit` | Run unit coverage + thresholds |
| `npm run test:coverage:integration` | Run integration coverage for `organizations` routes |
| `npm run test:coverage` | Run unit + integration coverage |
| `npm run test:all` | Run unit + integration + coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Run tests with Vitest UI |

Test command equivalents:

- `npm run test` (canonical)
- `bun run test`
- `bun run test:integration`
- `bun run test:coverage:unit`
- `bun run test:coverage:integration`
- `bun run test:coverage`
- `bun run test:all`

## Project Structure

```
anthon-2.0/
├── src/
│   ├── app/           # Next.js App Router pages
│   ├── components/    # Shared UI components
│   ├── lib/           # Core business logic
│   ├── hooks/         # React hooks
│   └── types/         # TypeScript types
├── prisma/            # Database schema & migrations
├── docs/              # Documentation
└── public/            # Static assets
```

## Next Steps

-   [Architecture Overview](./architecture.md) - Understand the system design
-   [Database Schema](./database.md) - Learn about data models
-   [AI System](./ai-system.md) - Explore the AI components

---

## User Guide (Web)

This section is for users/admins who are using the app UI (not for developers). Technical details stay in the dedicated docs.

### Sign in / Sign up

- If you're signed out and open admin pages (`/admin`), you will be redirected away from restricted content.
- Chat supports guest mode: signed-out users can still use `/chat` with guest limits.
- After signing in, you should land back on the page you tried to open.

### Chats

- Open `/chat` to see your chat list and create a new chat.
- You can rename or delete chats from the UI.
- You can export a chat to Markdown from the chat UI (download).

### Search

- Global chat search is available from the UI and returns recent matches.
- Search requires at least 2 characters.

### Feedback

- You can give thumbs up/down feedback on assistant messages; it is saved for analytics and quality.

### Attachments (uploads)

- Max size: 10MB per file.
- Supported types depend on server validation; common formats include images, PDF, and text documents.
- If Vercel Blob is not configured, uploads will fail.

### Daily usage limits

- Usage is tracked daily and depends on your tier/role.
- Admins have unlimited limits.
- See [Rate Limiting](./rate-limiting.md) for the exact tiers and reset schedule.

---

## User Guide (Telegram)

If Telegram is enabled, you can chat with the bot and optionally link your Telegram identity to your Anthon account.

### Linking your Telegram account

1. Open the Telegram bot and send the command `/connect`.
2. The bot replies with a one-time link.
3. Open the link in a browser and sign in if needed.
4. If the link is valid, Telegram gets connected to your profile.

**Notes and common outcomes:**

- The link expires after ~10 minutes.
- A link can only be used once.
- You can connect only one Telegram identity to a profile.
- If the Telegram identity was previously attached to a guest profile, the app may migrate that guest data into your signed-in user during linking.

### Managing connected channels

- Open `/channels` to view connected channels.
- You can disconnect Telegram/WhatsApp from this page.

---

## Admin Guide

Admin UI is protected by role.

### Access

- Admin pages live under `/admin`.
- You need `ADMIN` or `SUPER_ADMIN` role.
- Only `SUPER_ADMIN` can change user roles.

### Dashboard & health

- `/admin` shows key metrics and service health (DB, OpenRouter, Clerk, Vercel Blob).
- If any service is misconfigured, the dashboard health cards will show an error.

### Users

- `/admin/users` lists users and basic stats.
- User roles can be updated by super admins.

### Organizations

- `/admin/organizations` lets admins create organizations, assign/invite owners, and configure contract limits.
- Seat limits are enforced on membership activation (accepted invites that would exceed seats are blocked).
- Owners manage memberships/roles/invitations in Clerk UI at `/organization`.

### RAG documents

- `/admin/rag` lets admins upload documents to the knowledge base.
- Supported formats include PDF, DOCX, TXT, MD.

### Where to find technical details

- API endpoints: [API Reference](./api.md)
- Database models: [Database](./database.md)
- Roles/auth: [Authentication](./authentication.md)
