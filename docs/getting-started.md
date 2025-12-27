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

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/anthon?schema=public"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# OpenRouter AI
OPENROUTER_API_KEY="sk-or-..."

# Optional: Vercel Blob (for file uploads)
BLOB_READ_WRITE_TOKEN="..."

# Telegram (optional: for bot + linking flow)
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_WEBHOOK_SECRET="..."
# Optional: used to redirect users back to the bot after linking
TELEGRAM_BOT_USERNAME="your_bot_username"

# Public URL used to generate link tokens (optional; falls back to VERCEL_URL / localhost)
NEXT_PUBLIC_APP_URL="https://your-domain.com"

# Optional: dev/testing flags
TELEGRAM_SYNC_WEBHOOK="false"
TELEGRAM_DISABLE_AI="false"
TELEGRAM_DISABLE_SEND="false"

# QStash (System Maintenance)
QSTASH_URL="https://qstash.upstash.io/v2/publish/"
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."
CRON_SECRET="..."
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

- If you're signed out and open a protected page (like `/chat` or `/channels`), you will be redirected to `/sign-in`.
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

### RAG documents

- `/admin/rag` lets admins upload documents to the knowledge base.
- Supported formats include PDF, DOCX, TXT, MD.

### Where to find technical details

- API endpoints: [API Reference](./api.md)
- Database models: [Database](./database.md)
- Roles/auth: [Authentication](./authentication.md)
