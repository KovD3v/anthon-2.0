# User and Admin Guide

This guide covers the current web interface and account-linking flows. Developer setup lives in [Getting Started](./getting-started.md).

## Web chat

- Open `/chat` to create, rename, search, export, or delete conversations.
- Signed-out users can chat through a 30-day HttpOnly guest cookie.
- Guest users cannot attach files, generate voice output, or persist extracted memories.
- When a guest signs in, the next authenticated chat-list request migrates eligible guest data into the registered account.
- Assistant messages accept thumbs up, neutral, or thumbs down feedback.
- Usage and effective limits are visible at `/chat/usage`.

### Attachments

- Maximum file size: 10 MB.
- Supported categories include images, common documents, text/code, archives, audio, and video; the server's allowlist is authoritative.
- Uploads require a signed-in user and Vercel Blob configuration.
- Uploaded chat files use public Blob access. Anyone who obtains the object URL may be able to fetch it; the upload path currently allowlists types but does not scan for malware.
- Retention depends on the effective personal plan.

### Profile and preferences

- `/profile` is Clerk-gated and contains account/profile settings.
- The current profile UI exposes quiet/voice mode. Tone, response mode, language, and push preferences also exist in storage/API and may be managed by the AI, but are not all editable controls on that page.
- The AI can update profile, preferences, and memories when conversation context warrants it.

### Account deletion

Self-service deletion first blocks accounts that still created organizations, then removes owned attachment/artifact Blob objects, deletes the Clerk identity, and hard-deletes the local user. A Blob failure leaves the account intact for retry. Clerk and PostgreSQL are separate systems, so an infrastructure failure between their final deletion calls still requires operational follow-up.

## Telegram and WhatsApp

External channel identities can exist as guest users before they are linked to a web account.

### Link a channel

1. Send `/connect` to the Telegram or WhatsApp bot.
2. Open the one-time link returned by the bot.
3. Sign in or sign up in the browser.
4. The link page consumes the token, migrates guest data when necessary, and attaches the channel identity to the signed-in user.

Link tokens expire after approximately ten minutes and can be consumed once. Connected identities are managed from `/channels`.

Telegram and WhatsApp messages currently share the user's profile, memories, entitlements, and usage accounting, but they are stored without a web `Chat` container. They do not appear as ordinary conversations in the `/chat` list.

## Organizations

- `/organization` exposes Clerk organization profile/membership UI for signed-in members.
- Users cannot create organizations from that page; creation is admin-only.
- Organization membership can contribute an entitlement candidate. The system selects the strongest effective candidate across personal and active organization sources.

## Admin guide

Admin routes require an authenticated `ADMIN` or `SUPER_ADMIN` database role. The proxy provides the initial session gate; the admin layout and API helpers enforce the role.

| Page | Purpose |
| --- | --- |
| `/admin` | KPIs and a status panel; only the database status is currently a live check |
| `/admin/analytics` | Usage, cost, and funnel analytics |
| `/admin/costs` | Model cost reporting |
| `/admin/users` | User search/detail; role changes require `SUPER_ADMIN` |
| `/admin/organizations` | Create/sync organizations, contracts, owners, seats, and audit history |
| `/admin/rag` | Upload and manage global knowledge-base documents |
| `/admin/jobs` | Manually trigger maintenance jobs and inspect QStash events |
| `/admin/voice` | ElevenLabs and voice-generation statistics |
| `/admin/benchmark` | Create, run, compare, export, and inspect AI benchmarks |

### Operational cautions

- The `/admin` status panel performs live PostgreSQL, OpenRouter, Clerk, and read-only Blob checks. Public `/api/health` exposes shallow liveness only; `/api/health?details=1` exposes the same detailed checks to admins.
- Coordinated organization writes can require manual Clerk/database comparison and repair after partial external failures; the metadata sync action does not repair contracts or memberships.
- Triggering maintenance publishes work per eligible user; see [Maintenance](./maintenance.md).
- RAG documents form one global corpus, not a per-user collection. Uploaded originals use public Blob access.

For API-level details, see [API Reference](./api.md) and [Organizations](./organizations.md).
