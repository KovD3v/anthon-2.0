# Database Cleanup & Improvement Design

**Date:** 2026-03-28
**Status:** Draft
**Scope:** Two-phase — infrastructure/cleanup first, structural improvements second

---

## Context

Anthon 2.0 uses a single Neon project (`AnthonChat`, `raspy-rain-67305643`) with two branches:

| Branch | Intended role | Current state |
|--------|--------------|---------------|
| `production` (`br-hidden-rain-agfh4j0d`) | Live deployed database | **Empty — no tables** |
| `development` (`br-old-sunset-agnc02jg`) | Dev/test database | All tables, test data |

The production branch has never had migrations applied. The `build` script already runs `prisma migrate deploy` automatically, but Vercel env vars have never been pointed at the production branch. The development branch additionally has 7 orphaned schemas left over from an older test architecture that no longer exists in code.

The database is pre-launch (1 real user, 0 real messages) — no data migration risk.

---

## Phase 1 — Infrastructure & Cleanup

### 1. Production branch: run migrations

**Problem:** The production Neon branch has zero tables.

**Fix:** Point Vercel environment variables at the production branch. The build script already runs `prisma migrate deploy` — no code change needed, just env config.

Required Vercel env vars:
```
DATABASE_URL=<production branch pooled connection string>
DIRECT_DATABASE_URL=<production branch direct connection string>
```

Additionally, add `scripts/migrate-prod.sh` for explicit local/manual runs:
```bash
#!/usr/bin/env bash
# Runs Prisma migrations against the production Neon branch.
# Requires PROD_DATABASE_URL and PROD_DIRECT_DATABASE_URL to be set.
set -euo pipefail
: "${PROD_DATABASE_URL:?PROD_DATABASE_URL is required}"
: "${PROD_DIRECT_DATABASE_URL:?PROD_DIRECT_DATABASE_URL is required}"
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_DATABASE_URL="$PROD_DIRECT_DATABASE_URL" \
  ./node_modules/.bin/prisma migrate deploy
```

This gives a clear, explicit path for manual production migrations that cannot accidentally target the development branch.

### 2. Integration test safety guard

**Problem:** `global-setup.ts` overrides `DATABASE_URL` to `TEST_DATABASE_URL` before tests run, but nothing prevents `TEST_DATABASE_URL` from accidentally being pointed at the production Neon host.

**Fix:** Add a host-comparison guard at the top of `globalSetup()`. Before overriding `DATABASE_URL`, compare the hostname of `TEST_DATABASE_URL` against `DATABASE_URL`. If they resolve to the same Neon endpoint, abort with a clear error message.

```
Error: TEST_DATABASE_URL resolves to the same host as DATABASE_URL.
       Refusing to run integration tests against the production database.
```

### 3. Drop orphaned schemas from development branch

**Problem:** 7 schemas are abandoned in the dev branch from a previous test architecture:
- `itest_1771329708863_cd38cfae`
- `itest_1771329762773_6a7babb4`
- `itest_probe_1771329868`
- `itest_probe_1771329884`
- `itest_probe_1771329897`
- `itest_probe_1771329897,public` ← comma in name; a string concatenation bug in old code
- `undefined` ← JavaScript `undefined` leaked as a schema name

All dropped with `CASCADE`. Applied directly via Neon MCP / SQL — no Prisma migration needed since these are not in the schema.

### 4. Add `reasoningTokens` to `DailyUsage`

**Problem:** `Message` tracks `reasoningTokens` per response, but `DailyUsage` only tracks `inputTokens` + `outputTokens`. Reasoning tokens are invisible in the daily aggregate, making cost tracking incomplete for models that expose them.

**Fix:** New Prisma migration:
```prisma
model DailyUsage {
  // ...existing fields...
  reasoningTokens Int @default(0)  // ← new
}
```

Update the usage-tracking path in `cost-calculator.ts` to increment `reasoningTokens` alongside the existing token counters.

---

## Phase 2 — Structural Improvements

### 1. Memory `category` column

**Problem:** The `Memory.value` JSON stores a `MemoryValue` object with shape `{content, category, confidence, createdAt, updatedAt}`. The `category` field (identity / sport / goal / preference / health / schedule / other) is buried inside the JSON blob. Every memory query fetches all rows and filters by category in application code — no DB-level filtering is possible.

**Fix:** Promote `category` to a first-class column with a composite index.

```prisma
model Memory {
  // ...existing fields...
  category String @default("other")

  @@unique([userId, key])
  @@index([userId, category])  // ← new
}
```

Migration steps:
1. `ALTER TABLE "Memory" ADD COLUMN category TEXT NOT NULL DEFAULT 'other'`
2. `UPDATE "Memory" SET category = value->>'category' WHERE value->>'category' IS NOT NULL`
3. Create index on `(userId, category)`

Code changes:
- **`memory.ts` `getMemories` tool** — change filter from in-memory (`value.category === category`) to Prisma `where: { userId, ...(category && category !== 'all' ? { category } : {}) }`. Removes the full-table fetch-then-filter pattern.
- **`memory.ts` `saveMemory` tool** — write `category` column alongside the JSON value. The JSON blob retains the `category` field for backward compatibility but the column is now the source of truth for filtering.
- **`memory.ts` `formatMemoriesForPrompt`** — already groups by category in application code; no functional change, but grouping can now be done with `ORDER BY category` in the query if desired.
- **`memory-consolidation.ts`** — can now query memories by category if needed for targeted consolidation.

### 2. `Message.content` sunset

**Problem:** When a message is saved, both `content` (plain text string) and `parts` (AI SDK v5 JSON array) are written. `content` is the legacy field; `parts` is the canonical format going forward. Having both means double the write cost and two sources of truth for the same data.

**Read paths that currently use `content`:**
| File | Usage |
|------|-------|
| `session-manager.ts:78` | `m.content \|\| "[media]"` — builds summary text |
| `session-manager.ts:110` | `content: message.content \|\| ""` — AI SDK message format |
| `session-archiver.ts:95` | `m.content` — session summary generation |
| `chats/search/route.ts` | `WHERE content CONTAINS query` — full-text search + snippet |
| `chats/[id]/route.ts` et al. | API responses returned to frontend |

**Fix (two sub-steps):**

**2a — Stop writing `content` in the persistence layer:**
Remove the `content: text` field from the `prisma.message.create` call in `persistence.ts`. Only `parts` is written going forward.

**2b — Migrate read paths:**
Add a `getTextFromParts(parts: unknown): string` utility that extracts the text content from an AI SDK parts array (first `{type: "text"}` entry). Update each read path above to use this utility instead of `.content`.

The search route is the most complex case: the current `ILIKE` search on `content` needs to be replaced with a `jsonb` extraction query: `parts::jsonb -> 0 ->> 'text'`. Given the low message volume at launch, a full-text approach is not needed yet — a `LIKE` on the extracted JSON text is acceptable.

**Migration:** Backfill any rows where `parts IS NULL` and `content IS NOT NULL` before dropping the column (defensive — in practice there are 0 messages).

**Column drop:** Remove `content String?` from the Prisma schema in the same Phase 2 commit, after all read paths above are updated. Note: frontend components that receive messages from `chats/[id]/route.ts` may also read `content` — audit `src/app/(chat)/components` for any direct use of `message.content` before dropping.

### 3. Voice cost in `DailyUsage`

**Problem:** `trackVoiceUsage()` in `voice/funnel.ts` writes to `VoiceUsage` (granular per-generation record) but never updates `DailyUsage.totalCostUsd`. Voice costs are invisible in the daily cost aggregate used by the rate limiter.

**Fix:**

```prisma
model DailyUsage {
  // ...existing fields...
  voiceCostUsd Float @default(0)  // ← new
}
```

Update `trackVoiceUsage()` to also upsert `DailyUsage`, incrementing `voiceCostUsd` and `totalCostUsd` by the voice generation cost. This makes daily cost limits accurate for users who use voice heavily.

### 4. Message index audit

**Problem:** `Message` has 9 indexes. It is the highest-write table (every chat message, every channel webhook). Excessive indexes slow down inserts and updates.

**Current indexes:**
| Index | Keep? | Reason |
|-------|-------|--------|
| `userId_channel_createdAt` | ✓ | Core multi-channel history query |
| `chatId_createdAt` | ✓ | Chat message loading |
| `deletedAt` | ✓ | Soft-delete filtering on every read |
| `channel_externalMessageId` (unique) | ✓ | Webhook dedup |
| `userId_role_createdAt` | ✓ | Profile analyzer (last N user messages) |
| `model_createdAt` | ✓ | Admin analytics — model performance queries |
| `role_createdAt` | ✗ | `role` without `userId` is never useful; covered by `userId_role_createdAt` |
| `direction_createdAt` | ✗ | Low selectivity (2 values); never queried without other filters |
| `type` | ✗ | Low selectivity (TEXT dominates); no standalone query pattern |

**Fix:** Remove 3 indexes from the Prisma schema + migration:
```sql
DROP INDEX "Message_role_createdAt_idx";
DROP INDEX "Message_direction_createdAt_idx";
DROP INDEX "Message_type_idx";
```

---

## Documentation Updates

### `docs/database.md`

Add a **Neon Branch Setup** section documenting the two-branch model:

```
## Neon Branch Setup

The project uses a single Neon project with two branches:

| Branch | Role | Used by |
|--------|------|---------|
| `production` | Live deployed database | Vercel (DATABASE_URL / DIRECT_DATABASE_URL) |
| `development` | Dev/test database | Integration tests (TEST_DATABASE_URL), local dev |

**Migrations run automatically** via `npm run build` → `prisma migrate deploy`.
For production: set DATABASE_URL and DIRECT_DATABASE_URL in Vercel to the
production branch connection strings. The next deploy will apply all pending migrations.

For manual production migration, use scripts/migrate-prod.sh (requires
PROD_DATABASE_URL and PROD_DIRECT_DATABASE_URL env vars).

Never point TEST_DATABASE_URL at the production branch — the integration test
setup (global-setup.ts) will refuse to run if TEST_DATABASE_URL and DATABASE_URL
resolve to the same host.
```

Also update the DailyUsage and Memory model tables to reflect the new columns.

### `docs/getting-started.md`

Update the database setup section to clarify:
- `DATABASE_URL` / `DIRECT_DATABASE_URL` → production Neon branch
- `TEST_DATABASE_URL` → development Neon branch
- Link to `scripts/migrate-prod.sh` for initial production setup

---

## Commit Plan

**Commit 1 — Phase 1:**
- `scripts/migrate-prod.sh`
- `src/test/integration/global-setup.ts` — safety guard
- SQL: drop 7 orphaned schemas (applied via migration or direct SQL)
- `prisma/schema.prisma` — add `reasoningTokens` to `DailyUsage`
- New Prisma migration for `reasoningTokens`
- `src/lib/ai/cost-calculator.ts` — increment reasoningTokens in DailyUsage
- Docs: update `database.md`, `getting-started.md`

**Commit 2 — Phase 2:**
- `prisma/schema.prisma` — Memory category column, Message drop content + 3 indexes, DailyUsage voiceCostUsd
- New Prisma migrations
- `src/lib/ai/tools/memory.ts` — category column writes + DB-level filter
- `src/lib/channel-flow/persistence.ts` — stop writing `content`
- `src/lib/ai/session-manager.ts` — use `getTextFromParts` utility
- `src/lib/maintenance/session-archiver.ts` — use `getTextFromParts` utility
- `src/app/api/chats/search/route.ts` — JSON-based search
- `src/lib/voice/funnel.ts` — update `trackVoiceUsage` to also write DailyUsage
- `src/lib/utils/message-parts.ts` — new `getTextFromParts` utility
- Docs: update Memory and DailyUsage sections in `database.md`
