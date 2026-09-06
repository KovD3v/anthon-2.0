# Automated Maintenance System

The maintenance subsystem runs background jobs to keep user data compact, useful, and cost-efficient.

It uses **Upstash QStash** for signed asynchronous execution.

Vercel Cron also invokes bounded global maintenance routes for attachments, AI
turn traces, usage reservations, and model-comparison retention.

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
                                                       │ + Gemini 2.5 Flash Lite     │
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

La retention usa il migliore entitlement personale o organizzativo. Un account
registrato senza accesso corrente conserva la finestra operativa di 7 giorni,
senza ottenere accesso al coaching.

### 4. External inbound delivery

Telegram and WhatsApp webhooks publish authenticated provider messages to
`POST /api/queues/external-inbound` before acknowledging the provider. The
worker verifies the QStash signature, claims the persisted inbound message with
its lease, and runs the normal channel flow. WhatsApp batches are split into one
queue message per WAMID. Failed work and an active lease return `503` so QStash
can retry; completed duplicates are acknowledged. The queue uses five bounded
retries with an exponential delay that extends beyond the five-minute inbound
lease, allowing a crashed worker to be reclaimed.
An explicitly delivered fallback response is terminal, so retries do not repeat
the same error notice. Failed deliveries remain retryable.

## Trigger and Security Model

- `GET /api/cron/trigger?job=all|consolidate|archive|analyze`
  - Requires `Authorization: Bearer $CRON_SECRET`.
  - Selects non-guest active users and publishes queue tasks.
- `POST /api/queues/consolidate|archive|analyze`
  - Verifies `Upstash-Signature` via `verifyQStashAuth()`.
- `POST /api/queues/external-inbound`
  - Verifies `Upstash-Signature` and dispatches one Telegram update or WhatsApp
    WAMID. Provider signatures are checked by the public webhook before queue
    publication.

## Attachment Cleanup Cron

Attachment cleanup is a separate cron flow:

- Route: `GET|POST /api/cron/cleanup-attachments`
- Security: `Authorization: Bearer $CRON_SECRET`
- Purpose: deletes expired `Attachment` records and corresponding blob objects based on retention policy.
- A user without paid access cannot abort the batch; the job applies the
  seven-day no-access window and continues with the next user.
- Each bounded batch publishes remaining work to signed
  `POST /api/queues/cleanup-attachments`. User and attachment cursors advance
  past scanned records, including failed Blob deletions; those failures are
  retried during the next daily sweep. QStash must be configured for the sweep
  to reach users and attachments beyond the first batch.

## Scheduled Vercel Cron Jobs

`vercel.json` is the schedule source of truth:

| Schedule (UTC) | Route | Purpose |
| -------------- | ----- | ------- |
| `0 3 * * *` | `GET /api/cron/cleanup-attachments` | Delete expired attachment records and Blob objects. |
| `15 3 * * *` | `GET /api/cron/cleanup-ai-traces` | Delete expired encrypted AI turn traces and retain usage reservations. |
| `17 3 * * *` | `GET /api/cron/model-comparisons` | Expire unresolved comparison pairs and purge retained response content. |

All three routes require `Authorization: Bearer $CRON_SECRET`. Attachment and
AI-trace/usage-reservation cleanup also accept `POST` for an equivalent manual
invocation. AI usage cleanup expires stale `RESERVED` leases, clears expired
recovery payloads, and removes terminal rows after the retention window.

The model-comparison maintenance path is database-local; it is separate from
the per-user QStash jobs above and does not generate new model responses.

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
