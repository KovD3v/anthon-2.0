# Automated Maintenance System

The Automated Maintenance System keeps the Anthon platform efficient, cost-effective, and personalized by running background jobs to consolidate data and analyze user behavior.

It is powered by **Upstash QStash** for reliable serverless scheduling and execution.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  QStash      │ ───► │  /api/cron/* │ ───► │  Maintenance │
│  (Scheduler) │      │  (Next.js)   │      │  Modules     │
└──────────────┘      └──────────────┘      └──────────────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ Gemini 2.0   │
                                            │ Flash Lite   │
                                            └──────────────┘
```

## Jobs

All jobs are located in `src/lib/maintenance/` and exposed via API routes in `src/app/api/cron/`.

### 1. Memory Consolidation

**Schedule:** Daily (e.g., 04:00 AM)
**File:** `src/lib/maintenance/memory-consolidation.ts`
**Route:** `/api/cron/consolidate-memories`

**Purpose:**
Prevents "memory bloat" by merging redundant or obsolete memories.

**Process:**

1.  Fetches users who have >10 new memories since last run.
2.  Retrieves all active memories for the user.
3.  Uses **Gemini 2.0 Flash** to:
    -   Merge duplicates (e.g., "likes red" + "likes color red" -> "likes red").
    -   Resolve conflicts (newer value wins).
    -   Group into valid categories (sport, goals, personal).
    -   Remove obsolete info.
4.  Updates the database transactionally.

### 2. Profile Analyzer

**Schedule:** Weekly (e.g., Sunday 03:00 AM)
**File:** `src/lib/maintenance/profile-analyzer.ts`
**Route:** `/api/cron/analyze-profile`

**Purpose:**
Builds a psychometric profile of the user to improve AI mirroring and empathy.

**Process:**

1.  Fetches last 50 user messages.
2.  Analyzes them with **Gemini 2.0 Flash** to identify:
    -   **Communication Style:** Formal/Informal, Concise/Verbose.
    -   **Tone:** Direct, Emotional, Analytical.
    -   **Values:** Performance, Health, Enjoyment.
3.  Updates `UserPreferences.style` which is injected into the Orchestrator system prompt.

### 3. Session Archiver

**Schedule:** Daily
**File:** `src/lib/maintenance/session-archiver.ts`
**Route:** `/api/cron/archive-sessions`

**Purpose:**
Keeps the active context window small to save tokens and costs, while preserving long-term knowledge.

**Process:**

1.  Identifies "inactive" sessions (last message > 24 hours ago).
2.  Generates a high-level summary of the session.
3.  Stores summary in `SessionSummary` table.
4.  **Deletes** the raw messages from the `Message` table (subject to retention policy).

## Configuration

### Environment Variables

Required keys in `.env`:

```env
QSTASH_URL="https://qstash.upstash.io/v2/publish/"
QSTASH_TOKEN="..."
CRON_SECRET="..." # Protection for API routes
```

### Manual Triggers

You can manually trigger jobs from the Admin Dashboard (`/admin/jobs`) or via curl:

```bash
curl -X POST https://your-app.com/api/cron/consolidate-memories \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Cost Implications

-   **QStash:** Free tier allows 500 requests/day, sufficient for most deployments.
-   **Gemini 2.0 Flash:** Extremely low cost ($0.10 / 1M input tokens), making daily maintenance feasible even for many users.
