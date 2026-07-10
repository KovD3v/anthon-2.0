# Database Schema

Anthon 2.0 uses PostgreSQL with Prisma ORM and pgvector for vector embeddings.

## Neon Branch Setup

The currently documented Neon layout uses separate production and development branches. Keep local, test, preview, and production scopes isolated even if the provider/project names change.

| Branch | Role | Used by |
|--------|------|---------|
| `production` | Live deployed database | Vercel Production only (`DATABASE_URL` / `DIRECT_DATABASE_URL`) |
| `development` | Local development | Local `DATABASE_URL` / `DIRECT_DATABASE_URL` |
| disposable test/preview branch | Integration tests and Vercel previews | `TEST_DATABASE_URL` or preview-scoped URLs |

Production-style migrations are explicit: `bun run db:migrate:deploy` runs `prisma migrate deploy`, while `bun run build` only generates Prisma Client and compiles Next.js. Run migrations against the intended environment before deploying code that depends on them. See [Deployment and Database Safety](./deployment.md).

For manual production migration:

```bash
PROD_DATABASE_URL=<pooled> PROD_DIRECT_DATABASE_URL=<direct> ./scripts/migrate-prod.sh
```

The `deletedAt` fields and Prisma extension filter rows that have already been marked deleted. The extension does not convert `delete` operations into updates; current delete routes hard-delete unless they explicitly set `deletedAt`.

**Safety:** Never point `TEST_DATABASE_URL` at the production branch. The integration
test setup (`global-setup.ts`) will abort if `TEST_DATABASE_URL` and `DATABASE_URL`
resolve to the same Neon host.

## Entity Relationship Overview

```
┌─────────────────┐
│      User       │
├─────────────────┤
│ id              │───┬───────────────────────────────────┐
│ clerkId         │   │                                   │
│ email           │   │    ┌──────────────┐               │
│ role            │   ├───▶│   Profile    │               │
└─────────────────┘   │    └──────────────┘               │
                      │    ┌──────────────┐               │
                      ├───▶│ Preferences  │               │
                      │    └──────────────┘               │
                      │    ┌──────────────┐               │
                      ├───▶│    Memory    │ (many)        │
                      │    └──────────────┘               │
                      │    ┌──────────────┐    ┌────────┐ │
                      ├───▶│     Chat     │───▶│Message │ │
                      │    └──────────────┘    └────────┘ │
                      │    ┌──────────────┐               │
                      ├───▶│  DailyUsage  │ (many)        │
                      │    └──────────────┘               │
                      │    ┌──────────────┐               │
                      ├───▶│ Subscription │               │
                      │    └──────────────┘               │
                      │    ┌───────────────┐              │
                      └───▶│ChannelIdentity│ (many)       │
                           └───────────────┘
```

## Core Models

### User

Central identity for all user data across channels.

| Field       | Type      | Description                 |
| ----------- | --------- | --------------------------- |
| `id`        | String    | CUID primary key            |
| `clerkId`   | String?   | Clerk authentication ID     |
| `email`     | String?   | User email                  |
| `role`      | UserRole  | USER, ADMIN, or SUPER_ADMIN |
| `deletedAt` | DateTime? | Soft delete timestamp       |

Guest support is used by web chat, Telegram, and WhatsApp:

- `isGuest` marks a user created before sign-up.
- `guestAbuseIdHash` can be used to de-duplicate/abuse-protect guest identities.
- `guestConvertedAt` is set when a guest profile is migrated into a registered user.

### Chat

Conversation container for grouping messages.

| Field        | Type           | Description                |
| ------------ | -------------- | -------------------------- |
| `id`         | String         | CUID primary key           |
| `userId`     | String         | Owner reference            |
| `title`      | String?        | Auto-generated or user-set |
| `visibility` | ChatVisibility | PRIVATE or PUBLIC          |
| `deletedAt`  | DateTime?      | Soft delete timestamp      |

### Message

Individual messages supporting text, media, and AI metadata.

| Field          | Type             | Description                                       |
| -------------- | ---------------- | ------------------------------------------------- |
| `id`           | String           | CUID primary key                                  |
| `chatId`       | String?          | Parent chat reference                            |
| `role`         | MessageRole      | USER, ASSISTANT, SYSTEM                          |
| `direction`    | MessageDirection | INBOUND or OUTBOUND                              |
| `type`         | MessageType      | TEXT, IMAGE, AUDIO, etc.                         |
| `parts`        | Json?            | AI SDK v6 message parts — canonical content format |
| `mediaUrl`     | String?          | Media URL (for non-web channels)                 |
| `mediaType`    | String?          | Media MIME type                                  |
| `externalMessageId` | String?     | External message id (unique per channel)         |
| `metadata`     | Json?            | Channel-specific payload (e.g. Telegram)        |
| `model`        | String?          | AI model used (e.g., "google/gemini-2.0-flash-001") |
| `inputTokens`  | Int?             | Prompt tokens                                    |
| `outputTokens` | Int?             | Generated tokens                                 |
| `costUsd`      | Float?           | Response cost                                    |
| `ragUsed`      | Boolean?         | Whether RAG was used                             |
| `feedback`     | Int?             | -1, 0, 1 user feedback on assistants            |

### Profile

User coaching information.

| Field        | Type      | Description      |
| ------------ | --------- | ---------------- |
| `name`       | String?   | User's name      |
| `sport`      | String?   | Primary sport    |
| `goal`       | String?   | Coaching goal    |
| `experience` | String?   | Experience level |
| `birthday`   | DateTime? | Date of birth    |
| `notes`      | String?   | Coach's notes    |

### Preferences

Communication and behavior preferences.

| Field          | Type     | Description |
| -------------- | -------- | ----------- |
| `tone`         | String?  | Preferred response tone; the AI prompt standardizes values such as `direct`, `empathetic`, `technical`, and `motivational`. |
| `mode`         | String?  | Preferred response mode such as `concise`, `elaborate`, `challenging`, or `supportive`. |
| `language`     | String?  | Preferred language code. Existing defaults use `IT`; the orchestrator asks for lowercase ISO 639-1 when it detects a language. |
| `push`         | Boolean? | Push notifications enabled. |
| `voiceEnabled` | Boolean? | Voice/quiet-mode preference. |

### Memory

Persistent key-value storage for user information.

| Field      | Type   | Description                                                                   |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| `key`      | String | Memory identifier                                                             |
| `value`    | Json   | Stored data                                                                   |
| `category` | String | Memory category: identity, sport, goal, preference, health, schedule, other |

Unique constraint on `(userId, key)` ensures one value per key per user.

## RAG Models

### RagDocument

Container for knowledge base documents.

| Field    | Type    | Description       |
| -------- | ------- | ----------------- |
| `id`     | String  | CUID primary key  |
| `title`  | String  | Document title    |
| `url`    | String? | Source URL        |
| `source` | String? | Source identifier |

### RagChunk

Embedded document chunks for vector search.

| Field        | Type         | Description           |
| ------------ | ------------ | --------------------- |
| `documentId` | String       | Parent document       |
| `content`    | String       | Chunk text            |
| `embedding`  | vector(1536) | pgvector embedding    |
| `index`      | Int          | Chunk sequence number |

Embedding dimensions are fixed in the Prisma schema and match the current embedding model. No HNSW/vector index is created by the tracked migrations, so do not assume indexed vector search until a raw SQL index migration is added and verified.

## Usage & Billing

### DailyUsage

Per-day usage tracking for rate limiting.

| Field           | Type  | Description                               |
| --------------- | ----- | ----------------------------------------- |
| `date`          | Date  | UTC date                                  |
| `requestCount`  | Int   | Daily requests                            |
| `inputTokens`   | Int   | Total input tokens                        |
| `outputTokens`  | Int   | Total output tokens                       |
| `reasoningTokens` | Int | Total reasoning tokens (models that expose them) |
| `totalCostUsd`  | Float | Total cost                                |
| `voiceCostUsd`  | Float | Voice generation cost for the day         |

### Subscription

User subscription and trial tracking.

| Field            | Type               | Description                   |
| ---------------- | ------------------ | ----------------------------- |
| `status`         | SubscriptionStatus | TRIAL, ACTIVE, CANCELED, etc. |
| `trialStartedAt` | DateTime?          | Trial start                   |
| `trialEndsAt`    | DateTime?          | Trial expiration              |
| `planId`         | String?            | Clerk plan ID                 |
| `planName`       | String?            | Plan display name             |

## Sessions, Voice, and Evaluation

### SessionSummary and ArchivedSession

- `SessionSummary` is an expiring cache for generated cross-channel session summaries.
- `ArchivedSession` stores the date range, summary, and message count for sessions whose raw messages were removed by retention maintenance.

### VoiceUsage

Each generated ElevenLabs response records the user, channel, character count, optional estimated cost, and generation timestamp. The helper can roll a supplied cost into `DailyUsage`, but current generation call sites omit it, so the stored cost is normally null.

### BenchmarkRun, BenchmarkResult, and BenchmarkTestCase

The admin benchmark subsystem stores reusable test cases, multi-model runs, generation/cost metrics, one or two judge scores, disagreement flags, and optional admin review. These models are operational evaluation data, not end-user conversations.

## Organizations (B2B)

### Organization

Contract-bound tenant linked to Clerk Organization identity.

| Field                 | Type               | Description |
| --------------------- | ------------------ | ----------- |
| `clerkOrganizationId` | String             | Clerk org ID (unique) |
| `name`                | String             | Organization display name |
| `slug`                | String             | Unique organization slug |
| `status`              | OrganizationStatus | ACTIVE, SUSPENDED, ARCHIVED |
| `ownerUserId`         | String?            | Internal owner user; may be null while an invited owner is pending |
| `pendingOwnerEmail`   | String?            | Pending owner invite email |

### OrganizationContract

Authoritative contract limits for an organization.

| Field                 | Type                  | Description |
| --------------------- | --------------------- | ----------- |
| `basePlan`            | OrganizationBasePlan  | Organization base entitlement plan: BASIC, BASIC_PLUS, PRO |
| `seatLimit`           | Int                   | Maximum active members |
| `planLabel`           | String                | Human-readable plan name |
| `modelTier`           | OrganizationModelTier | Required stored model tier, initialized from the base plan and available as an explicit override |
| `maxRequestsPerDay`   | Int                   | Daily request entitlement |
| `maxInputTokensPerDay`| Int                   | Daily input token entitlement |
| `maxOutputTokensPerDay`| Int                  | Daily output token entitlement |
| `maxCostPerDay`       | Float                 | Daily cost entitlement |
| `maxContextMessages`  | Int                   | Context window cap |
| `version`             | Int                   | Contract version counter |

Entitlement behavior:

- `basePlan` defines the default limits and model tier.
- Contract fields (`seatLimit`, numeric limits, `modelTier`) are enterprise overrides on top of that base.
- For active organization members, each valid contract contributes a candidate. The resolver selects the strongest candidate across personal and organization sources; an organization does not automatically replace a stronger personal plan.

### OrganizationMembership

Local mirror of Clerk memberships.

| Field               | Type                       | Description |
| ------------------- | -------------------------- | ----------- |
| `clerkMembershipId` | String                     | Clerk membership ID (unique) |
| `role`              | OrganizationMemberRole     | OWNER or MEMBER |
| `status`            | OrganizationMembershipStatus | ACTIVE, REMOVED, BLOCKED |
| `joinedAt`          | DateTime?                  | Membership activation time |
| `leftAt`            | DateTime?                  | Membership deactivation time |

### OrganizationAuditLog

Immutable append-only history for contract-sensitive actions.

| Field        | Type                      | Description |
| ------------ | ------------------------- | ----------- |
| `actorType`  | OrganizationAuditActorType| ADMIN, SYSTEM, WEBHOOK |
| `action`     | OrganizationAuditAction   | Created/updated/owner/membership events |
| `before`     | Json?                     | Prior snapshot |
| `after`      | Json?                     | Updated snapshot |
| `metadata`   | Json?                     | Additional context |

## Multi-Channel

### ChannelIdentity

Links external identifiers to users.

| Field        | Type    | Description          |
| ------------ | ------- | -------------------- |
| `channel`    | Channel | WEB, WHATSAPP, TELEGRAM |
| `externalId` | String  | Platform-specific ID |

Unique constraint on `(channel, externalId)`.

### ChannelLinkToken

One-time linking tokens used to connect an external identity (e.g. Telegram user id) to a signed-in user.

Key fields:

- `tokenHash` is stored instead of the raw token.
- `expiresAt` enforces a short validity window (e.g. ~10 minutes).
- `consumedAt` / `consumedByUserId` track successful consumption.

---

## Attachments & Artifacts

### Attachment

Tracks an uploaded file (stored in Vercel Blob) and optionally links it to a message.

- During upload, the record can be created without `messageId`.
- When the user sends a message, the server links attachments to the saved message.

### Artifact / ArtifactVersion

Artifacts are generated outputs associated with a chat (and optionally a message).

- `Artifact` is the logical container.
- `ArtifactVersion` stores versioned content (optionally in Blob for large payloads).

## Useful Queries

```sql
-- Get user's recent messages with chat context
SELECT m.* FROM "Message" m
JOIN "Chat" c ON m."chatId" = c.id
WHERE m."userId" = 'user_id'
ORDER BY m."createdAt" DESC
LIMIT 50;

-- Search RAG chunks by similarity
SELECT content, 1 - (embedding <=> query_embedding) as similarity
FROM "RagChunk"
WHERE embedding IS NOT NULL
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

## Related Documentation

-   [AI System](./ai-system.md) - How the database is used in AI processing
-   [Rate Limiting](./rate-limiting.md) - DailyUsage in action
