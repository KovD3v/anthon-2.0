# Automated Maintenance System

The maintenance subsystem runs background jobs to keep user data compact, useful, and cost-efficient.

It uses **Upstash QStash** for signed asynchronous execution.

## Architecture

```
┌─────────────────────┐      ┌──────────────────────────┐      ┌───────────────────┐
│ Scheduler / Manual  │ ───► │ GET /api/cron/trigger    │ ───► │ QStash publish    │
│ trigger (admin/curl)│      │ (CRON_SECRET protected)  │      │ per user/job      │
└─────────────────────┘      └──────────────────────────┘      └─────────┬─────────┘
                                                                          │
                                                                          ▼
                                                       ┌─────────────────────────────┐
                                                       │ POST /api/queues/*          │
                                                       │ (QStash signature verified) │
                                                       └──────────────┬──────────────┘
                                                                      │
                                                                      ▼
                                                       ┌─────────────────────────────┐
                                                       │ src/lib/maintenance/*       │
                                                       │ + Gemini 2.0 Flash Lite     │
                                                       └─────────────────────────────┘
```

## Jobs

### 1. Memory Consolidation

- File: `src/lib/maintenance/memory-consolidation.ts`
- Queue endpoint: `POST /api/queues/consolidate`
- Behavior:
  1. Loads all user memories.
  2. Skips consolidation when memories are fewer than 5.
  3. Uses the maintenance model to propose merges/conflict resolutions.
  4. Applies updates transactionally and invalidates memory prompt cache.

### 2. Profile Analyzer

- File: `src/lib/maintenance/profile-analyzer.ts`
- Queue endpoint: `POST /api/queues/analyze`
- Behavior:
  1. Reads the last 50 user messages (`role=USER`).
  2. Requires at least 10 messages.
  3. Infers `tone`, `mode`, and profile updates (`sport`, `goal`, `experience`, notes).
  4. Persists updates with upsert logic.

### 3. Session Archiver

- File: `src/lib/maintenance/session-archiver.ts`
- Queue endpoint: `POST /api/queues/archive`
- Behavior:
  1. Computes retention days from role/plan.
  2. Uses a 24h safety buffer (never touches very recent messages).
  3. Groups messages into sessions (15-minute gap rule).
  4. Archives sessions fully outside retention window to `ArchivedSession`.
  5. Hard-deletes archived raw messages from `Message`.

## Trigger and Security Model

- `GET /api/cron/trigger?job=all|consolidate|archive|analyze`
  - Requires `Authorization: Bearer $CRON_SECRET`.
  - Selects non-guest active users and publishes queue tasks.
- `POST /api/queues/consolidate|archive|analyze`
  - Verifies `Upstash-Signature` via `verifyQStashAuth()`.

## Attachment Cleanup Cron

Attachment cleanup is a separate cron flow:

- Route: `GET|POST /api/cron/cleanup-attachments`
- Security: `Authorization: Bearer $CRON_SECRET`
- Purpose: deletes expired `Attachment` records and corresponding blob objects based on retention policy.

## Environment Variables

Required for maintenance execution:

```env
QSTASH_URL="https://qstash.upstash.io/v2"
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."
APP_URL="https://your-domain.com"
CRON_SECRET="..."
```

## Manual Triggers

From Admin UI: `/admin/jobs`

From CLI:

```bash
curl -sS "https://your-app.com/api/cron/trigger?job=all" \
  -H "Authorization: Bearer $CRON_SECRET"

curl -sS "https://your-app.com/api/cron/trigger?job=consolidate" \
  -H "Authorization: Bearer $CRON_SECRET"
```
