# Maintenance and Scheduled Jobs

Anthon uses Upstash QStash for signed per-user maintenance work and Vercel Cron for attachment cleanup. Only attachment cleanup has a schedule tracked in this repository; the other jobs require a manual or external trigger.

## Execution model

```text
admin / curl / external scheduler
             |
    GET /api/cron/trigger
       CRON_SECRET check
             |
     one QStash message per
        eligible user/job
             |
      POST /api/queues/*
      QStash signature check
             |
   src/lib/maintenance/*
```

The trigger excludes guest and soft-deleted users.

## Jobs

### Memory consolidation

- Library: `src/lib/maintenance/memory-consolidation.ts`
- Consumer: `POST /api/queues/consolidate`
- Skips users with fewer than five memories.
- Uses the maintenance model to propose merges and conflict resolution.
- Applies changes transactionally and invalidates memory prompt cache.

### Session archival

- Library: `src/lib/maintenance/session-archiver.ts`
- Consumer: `POST /api/queues/archive`
- Uses personal role/plan retention policy.
- Excludes messages from the last 24 hours.
- Groups messages with the 15-minute session-gap rule.
- Archives only sessions whose end is older than the retention cutoff.
- Stores `ArchivedSession`, then hard-deletes the archived raw messages.

### Profile analysis

- Library: `src/lib/maintenance/profile-analyzer.ts`
- Consumer: `POST /api/queues/analyze`
- Reads up to the 50 most recent user messages.
- Skips users with fewer than ten messages.
- Infers communication preferences and selected profile fields.
- Persists results with upserts.

## Trigger semantics

`GET /api/cron/trigger?job=...` accepts:

| Value | Jobs published |
| --- | --- |
| `all` or omitted | Memory consolidation and session archival |
| `consolidate` | Memory consolidation only |
| `archive` | Session archival only |
| `analyze` | Profile analysis only |

`all` does not include profile analysis.

The endpoint requires:

```text
Authorization: Bearer $CRON_SECRET
```

Queue consumers verify `Upstash-Signature` with the configured current/next signing keys.

## Attachment cleanup

`GET|POST /api/cron/cleanup-attachments`:

- requires `CRON_SECRET`;
- calculates retention from each user's personal role/plan policy;
- removes expired Vercel Blob objects;
- deletes the corresponding `Attachment` rows;
- returns processed/deleted/error counters.

[`vercel.json`](../vercel.json) schedules this route daily at `03:00 UTC` (`0 3 * * *`).

## Current scheduling status

| Work | Tracked schedule |
| --- | --- |
| Attachment cleanup | Daily through `vercel.json` |
| Memory consolidation | None |
| Session archival | None |
| Profile analysis | None |

The admin page at `/admin/jobs` can invoke the general trigger. Production automation for those jobs must be configured outside this repository or added to `vercel.json`.

## Configuration

```env
QSTASH_URL="https://qstash.upstash.io/v2"
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."
APP_URL="https://your-domain.example"
CRON_SECRET="..."
```

`src/lib/qstash.ts` validates `QSTASH_URL` and `QSTASH_TOKEN` when imported, so missing values can fail an importing route/build before a job is invoked.

## Manual triggers

```bash
curl -sS "https://your-app.example/api/cron/trigger?job=all" \
  -H "Authorization: Bearer $CRON_SECRET"

curl -sS "https://your-app.example/api/cron/trigger?job=analyze" \
  -H "Authorization: Bearer $CRON_SECRET"
```

See [Deployment](./deployment.md) for schedule and environment checks.
