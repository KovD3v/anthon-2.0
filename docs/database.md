# Database Schema

Anthon 2.0 uses PostgreSQL with Prisma ORM and pgvector for vector embeddings.

## Neon Branch Setup

The project uses a single Neon project (`AnthonChat`) with two branches:

| Branch | Role | Used by |
|--------|------|---------|
| `production` | Live deployed database | Vercel runtime (`DATABASE_URL`) and production-build migrations (`DIRECT_DATABASE_URL`) |
| `development` | Long-lived development database | Local development and parent for ephemeral integration-test branches |
| `integration-*` | Ephemeral child of `development` | One migration/test run; deleted automatically afterward |

## Deployment migrations

`bun run build` is artifact-only: it generates the Prisma client and compiles
Next.js without mutating a database. Vercel runs `bun run vercel:build` instead:
on a production build it applies `prisma migrate deploy` first, then runs the
artifact build. Preview and local builds never apply migrations.

Configure `DIRECT_DATABASE_URL` as a **Production-only** Vercel environment
variable, pointing at the direct connection for the same Neon production branch
as `DATABASE_URL`. It is used only while the production build runs and must not
be configured for Preview. `DATABASE_URL` remains the pooled runtime connection.

### Preview path

Use a dedicated non-production Neon branch/database for Vercel Preview. Preview
builds remain artifact-only and do not need `DIRECT_DATABASE_URL`. Validate
schema changes against that branch before production; use only additive,
backwards-compatible migrations so an existing production deployment remains
safe until the Vercel production build applies them.

### Production path

After a preview has been validated, deploy the same commit to Vercel production.
The production build applies pending additive migrations before Next.js is
compiled, so the deployed application never starts against an older schema.
Wait for the build to succeed before treating the release as live.

### Expand, migrate, contract

Every rolling deployment must remain compatible with both the previous and next
application version:

1. **Expand:** add tables, nullable columns, additive indexes, or new values in
   a backwards-compatible migration. Run it through the selected migration
   workflow before deploying code that requires it.
2. **Migrate/backfill:** move existing data with a resumable, observable job;
   the application must tolerate rows that have not been backfilled yet.
3. **Adopt:** deploy code that reads/writes the new representation while retaining
   compatibility with the old one until every active deployment has changed.
4. **Contract:** only in a later release, after all old deployments are gone,
   remove obsolete fields or constraints through the same serialized workflow.

Do not combine a destructive contract change with its expand release.

### Integration-test branches

`bun run test:integration` requires `NEON_API_KEY`, `NEON_PROJECT_ID`, and a
local `DATABASE_URL` that points to the non-default `development` branch. The
runner resolves that endpoint's branch, refuses default, protected, `main`, or
`production` parents, creates an expiring child with a read-write compute, runs
`prisma migrate deploy`, injects `TEST_DATABASE_URL` only into Vitest, and
deletes the child in `finally`.

Do not store `TEST_DATABASE_URL` in `.env.local`. The existing host-comparison
guard in `global-setup.ts` remains in place as defense in depth. Neon branch
expiration provides a cleanup backstop if process-level deletion fails.

## Entity Relationship Overview

This diagram shows the primary user-owned records. The sections below also
cover conversation threads, coaching routines, model experiments, AI traces,
reservations, attachments, and durable voice jobs.

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

Guest support is used by anonymous web chat and by unlinked external channels:

- `isGuest` marks a user created before sign-up.
- `guestTokenHash` is the unique hash of the revocable HttpOnly guest session
  token.
- `guestAbuseIdHash` is a non-unique, domain-separated HMAC of the trusted
  client address used for abuse controls. The source address is never stored.
- `guestConvertedAt` is set when a guest profile is migrated into a registered user.

### Chat

Conversation container for grouping messages.

| Field        | Type           | Description                |
| ------------ | -------------- | -------------------------- |
| `id`         | String         | CUID primary key           |
| `userId`     | String         | Owner reference            |
| `title`      | String?        | Auto-generated or user-set |
| `customTitle`| Boolean        | Whether the title was manually set |
| `icon`       | ChatIcon       | Generated or fallback conversation icon |
| `visibility` | ChatVisibility | PRIVATE or PUBLIC          |
| `routineContextRoutineId` | String? | Routine reused to start this chat |
| `routineContextMode` | RoutineChatMode? | REPEAT or ADAPT invocation mode |
| `deletedAt`  | DateTime?      | Soft delete timestamp      |

### Message

Individual messages supporting text, media, and AI metadata.

| Field          | Type             | Description                                       |
| -------------- | ---------------- | ------------------------------------------------- |
| `id`           | String           | CUID primary key                                  |
| `chatId`       | String?          | Parent chat reference                            |
| `conversationThreadId` | String?   | Stable channel-scoped conversation reference     |
| `role`         | MessageRole      | USER, ASSISTANT, SYSTEM                          |
| `direction`    | MessageDirection | INBOUND or OUTBOUND                              |
| `type`         | MessageType      | TEXT, IMAGE, AUDIO, etc.                         |
| `parts`        | Json?            | AI SDK v7 message parts — canonical content format |
| `mediaUrl`     | String?          | Media URL (for non-web channels)                 |
| `mediaType`    | String?          | Media MIME type                                  |
| `externalMessageId` | String?     | External message id (unique per channel)         |
| `clientMessageId` | String?       | User-scoped browser message id used for retry-safe ingestion |
| `clientMessagePayloadHash` | String? | Canonical payload hash; changed retries are rejected |
| `sourceInboundMessageId` | String? | Inbound message answered by this assistant message |
| `metadata`     | Json?            | Channel-specific payload (e.g. Telegram)        |
| `model`        | String?          | AI model used (e.g., "google/gemini-2.5-flash") |
| `inputTokens`  | Int?             | Prompt tokens                                    |
| `outputTokens` | Int?             | Generated tokens                                 |
| `costUsd`      | Float?           | Response cost                                    |
| `ragUsed`      | Boolean?         | Whether RAG was used                             |
| `feedback`     | Int?             | -1, 0, 1 user feedback on assistants            |

`MessageMetrics` is the normalized one-to-one telemetry record for a persisted
assistant message. It stores provider/model identifiers, token and cost data,
generation timing, RAG usage, redacted provider metadata, and bounded tool
timing. Legacy scalar metrics remain on `Message` for compatibility.

`MessageMetrics.executionRoute` stores the schema-validated, privacy-allowlisted
routing trace: eligible, planned, and executed profile; task kind; policy and
classifier versions; confidence bucket; reason codes; attempts; bounded timing;
and an optional light-to-standard escalation. It excludes user text, classifier
prose, prompts, tool arguments/results, source content, and raw provider
metadata. Its timing fields remain separate: `classificationLatencyMs` covers
the classifier, each attempt's `timeToFirstTokenMs` is generation TTFT, and
`totalRequestTimeToFirstTokenMs` measures request-start-to-first-token TTFT.

### ConversationThread and ConversationThreadSummary

`ConversationThread` is the stable raw-history boundary. Web chats have a
one-to-one `chatId`; Telegram and WhatsApp use their stable external thread
identifier. The unique key `(userId, channel, externalThreadId)` prevents raw
history from crossing users or channels.

`ConversationThreadSummary` stores one rolling summary per thread, including
the last covered message and a version number. Model-comparison pairs and AI
turn traces also reference the same thread so preparation, persistence, and
recovery use one conversation scope.

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

| Field      | Type     | Description                         |
| ---------- | -------- | ----------------------------------- |
| `tone`     | String?  | "calm", "energetic", "professional" |
| `mode`     | String?  | "coaching", "friendly", "direct"    |
| `language` | String?  | "IT", "EN", etc.                    |
| `push`     | Boolean? | Push notifications enabled          |
| `voiceEnabled` | Boolean? | Whether automatic voice delivery is allowed |
| `showTechnicalMetrics` | Boolean? | Whether technical response metrics are shown |

### Memory

Persistent key-value storage for user information.

| Field      | Type   | Description                                                                   |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| `key`      | String | Memory identifier                                                             |
| `value`    | Json   | Stored data                                                                   |
| `category` | String | Memory category: identity, sport, goal, preference, health, schedule, other |

Unique constraint on `(userId, key)` ensures one value per key per user.

### MemoryApproval

Pending approval for a sensitive or high-impact memory proposed by the
agentic planner. The record binds the proposed key/value/category to one user
and one source inbound message, expires automatically, and transitions through
`PENDING`, `APPROVED`, `REJECTED`, or `EXPIRED`. This lets a later natural
confirmation resolve the proposal without trusting model-supplied identifiers.

## Coaching Routines

### Routine

User-owned reusable coaching routine saved from a validated assistant proposal.
It stores its trigger, versioned JSON steps, duration label, completion cue,
active/archive state, source chat/message, and optional parent routine when an
adaptation is created. Multiple chats may invoke the same routine in `REPEAT`
or `ADAPT` mode without duplicating the definition.

### RoutineAttempt

One idempotent execution of a routine. `(routineId, clientActionId)` is unique;
the attempt stores its timestamp and optional `HELPFUL`, `PARTIALLY_HELPFUL`,
or `NOT_HELPFUL` outcome plus a bounded user note.

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

Uses HNSW index for efficient cosine similarity search.

Note: embedding dimensions are defined in the Prisma schema and depend on the embedding model.

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

### AiUsageReservation

Fences one billable AI turn before provider work begins. A user-scoped
`requestKey` makes retries idempotent, while `claimToken` prevents a stale
worker from reconciling a newer lease. Finite plans serialize in-flight turns
so concurrent requests cannot spend the same remaining daily allowance.

Successful assistant persistence and usage reconciliation share a database
transaction. If generation succeeds but persistence fails, bounded recovery
fields retain the assistant text plus content-free metrics and immutable routing
trace needed to finish a retry without calling the model or charging again.
Invalid or missing recovered route metadata fails closed to standard execution;
it is never recomputed from a later environment rollout value. Expired and old
terminal reservations are cleaned up during later reservations.

### DailyUploadUsage and UploadReservation

`DailyUploadUsage` records committed and currently reserved object counts and
bytes per user and UTC day. `UploadReservation` fences the exact file size
before Blob storage work. Creating the durable `Attachment` and committing the
quota reservation happen in the same transaction; failed uploads release the
reservation and remove any just-created Blob.

### GuestAbuseBucket

Stores only a keyed address fingerprint, UTC window, and guest-creation count.
The atomic upsert enforces the daily creation cap across cookie resets and
concurrent requests. Old windows are retained for 30 days and then removed.

## AI Experiments and Traces

### ModelExperiment

Administrative definition for a guarded two-variant comparison. Related
models store the control/candidate variants, enrolled participants, immutable
pairs, per-variant responses, lifecycle audits, and the user's final vote or
automatically selected canonical response. Each pair also persists the exact
conversation thread, prompt mode, capability-planner mode, immutable
`turnDecision`, expiry, and content purge deadline used for that comparison.

### AiTurnTrace and AiTraceAccessAudit

`AiTurnTrace` stores bounded operational metadata for one AI turn and may store
an AES-256-GCM encrypted content payload with an explicit expiry. Trace listing
is redacted; superadmin content access creates an append-only
`AiTraceAccessAudit`. The scheduled cleanup removes expired traces.

### Subscription

User subscription and trial tracking.

| Field            | Type               | Description                   |
| ---------------- | ------------------ | ----------------------------- |
| `status`         | SubscriptionStatus | TRIAL, ACTIVE, CANCELED, etc. |
| `trialStartedAt` | DateTime?          | Trial start                   |
| `trialEndsAt`    | DateTime?          | Trial expiration              |
| `planId`         | String?            | Clerk plan ID                 |
| `planName`       | String?            | Plan display name             |

## Organizations (B2B)

### Organization

Contract-bound tenant linked to Clerk Organization identity.

| Field                 | Type               | Description |
| --------------------- | ------------------ | ----------- |
| `clerkOrganizationId` | String             | Clerk org ID (unique) |
| `name`                | String             | Organization display name |
| `slug`                | String             | Unique organization slug |
| `status`              | OrganizationStatus | ACTIVE, SUSPENDED, ARCHIVED |
| `ownerUserId`         | String?            | Internal owner user (exactly one when active) |
| `pendingOwnerEmail`   | String?            | Pending owner invite email |

### OrganizationContract

Authoritative contract limits for an organization.

| Field                 | Type                  | Description |
| --------------------- | --------------------- | ----------- |
| `basePlan`            | OrganizationBasePlan  | Organization base entitlement plan: BASIC, BASIC_PLUS, PRO |
| `seatLimit`           | Int                   | Maximum active members |
| `planLabel`           | String                | Human-readable plan name |
| `modelTier`           | OrganizationModelTier | Optional enterprise override for model access tier (default comes from `basePlan`) |
| `maxRequestsPerDay`   | Int                   | Daily request entitlement |
| `maxInputTokensPerDay`| Int                   | Daily input token entitlement |
| `maxOutputTokensPerDay`| Int                  | Daily output token entitlement |
| `maxCostPerDay`       | Float                 | Daily cost entitlement |
| `maxContextMessages`  | Int                   | Context window cap |
| `version`             | Int                   | Contract version counter |

Entitlement behavior:

- `basePlan` defines the default limits and model tier.
- Contract fields (`seatLimit`, numeric limits, `modelTier`) are enterprise overrides on top of that base.
- For active organization members, the resolver compares personal and organization entitlement sources and applies the strongest source. Personal subscription is also used when organization contract data is missing/invalid.

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
- When the user sends a message, the server claims the inbound message and all
  still-unlinked, owner-scoped attachments in one transaction.
- Retries may reuse an attachment only when it is already linked to that exact
  inbound message. An attachment linked elsewhere is rejected.
- AI and transcription inputs are loaded from the canonical stored Blob URL;
  client-provided inline bytes are never authoritative.

### VoiceGenerationJob and VoiceUsage

`VoiceGenerationJob` owns the retry-safe QStash/ElevenLabs lifecycle for one
web assistant message. Status, claim token, lease, attempt count, private Blob
object, attachment, timing, and error code make at-least-once delivery safe.
`VoiceUsage` records the associated character count, estimated cost, channel,
and generation timestamp for plan enforcement and analytics.

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
