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
CLERK_WEBHOOK_SIGNING_SECRET="whsec_..."

# OpenRouter AI
OPENROUTER_API_KEY="sk-or-..."

# Optional: Vercel Blob (for file uploads)
BLOB_READ_WRITE_TOKEN="..."
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
