# API Reference

Anthon 2.0 exposes REST API endpoints for chat, channels, administration, and operations.

## Authentication and Security

### Clerk-authenticated routes

Most `/api/*` routes require an authenticated Clerk session and use `getAuthUser()`.

### Guest routes

Guest-only endpoints are under `/api/guest/*` and use cookie-based guest auth.

### Admin routes

`/api/admin/*` requires `ADMIN` or `SUPER_ADMIN` via `requireAdmin()`.
Role management (`PATCH /api/admin/users`) is restricted to `SUPER_ADMIN`.

### Secret/signed routes

- `GET /api/cron/trigger` and `GET|POST /api/cron/cleanup-attachments` require `Authorization: Bearer $CRON_SECRET`.
- `POST /api/queues/*` requires a valid `Upstash-Signature` header (QStash verification).

### Webhook verification

- Clerk webhook: `svix-id`, `svix-timestamp`, `svix-signature`
- Telegram webhook: `x-telegram-bot-api-secret-token`
- WhatsApp webhook POST: `x-hub-signature-256`
- WhatsApp webhook GET: `hub.verify_token` validation

## Shared Response Helpers

Routes commonly use helpers from `@/lib/api/responses`:

- `jsonOk`, `jsonCreated`
- `badRequest`, `unauthorized`, `forbidden`, `notFound`, `rateLimited`, `serverError`

## User API (Authenticated)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/chat` | Stream assistant response for a chat message. |
| `GET` | `/api/chats` | List chats for current user. |
| `POST` | `/api/chats` | Create new chat. |
| `GET` | `/api/chats/[id]` | Get chat details and paginated messages. |
| `PATCH` | `/api/chats/[id]` | Update chat title/visibility, optionally generate title. |
| `DELETE` | `/api/chats/[id]` | Delete chat and related entities. |
| `GET` | `/api/chats/[id]/export` | Export chat as Markdown download. |
| `GET` | `/api/chats/search?q=...` | Search inside user messages. |
| `GET` | `/api/chat/messages?chatId=...` | Load messages for one chat. |
| `PATCH` | `/api/chat/messages` | Edit one user message and truncate following messages in that chat. |
| `DELETE` | `/api/chat/messages?id=...` | Delete one user message and truncate following messages in that chat. |
| `POST` | `/api/chat/feedback` | Save thumbs feedback on assistant message (`-1`, `0`, `1`). |
| `GET` | `/api/usage` | Get usage, limits, and effective entitlement source for current user. |
| `GET` | `/api/preferences` | Read user preferences. |
| `PATCH` | `/api/preferences` | Update user preferences (`voiceEnabled`, `tone`, `mode`, `language`, `push`). |
| `POST` | `/api/upload` | Upload attachment to Vercel Blob and register `Attachment`. |
| `DELETE` | `/api/upload?url=...` | Delete uploaded blob for current user. |
| `DELETE` | `/api/channels/[id]` | Disconnect a linked channel identity. |

### Key request payloads

`POST /api/chat`

```ts
{
  chatId: string;
  messages: Array<{
    role: "user" | "assistant";
    parts?: Array<
      | { type: "text"; text: string }
      | { type: "file"; mimeType?: string; name?: string; size?: number; attachmentId?: string; data?: string }
    >;
  }>;
}
```

`PATCH /api/chat/messages`

```ts
{ messageId: string; content?: string }
```

`POST /api/chat/feedback`

```ts
{ messageId: string; feedback: -1 | 0 | 1 }
```

## Guest API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/guest/chat` | Stream chat response for guest user. |
| `GET` | `/api/guest/chats` | List guest chats. |
| `POST` | `/api/guest/chats` | Create guest chat. |
| `GET` | `/api/guest/chats/[id]` | Get guest chat detail. |
| `PATCH` | `/api/guest/chats/[id]` | Update guest chat title/visibility. |
| `DELETE` | `/api/guest/chats/[id]` | Delete guest chat. |
| `GET` | `/api/guest/usage` | Guest usage and limits. |

Notes:

- Guests cannot upload files in guest chat endpoint.
- Guest limits differ from authenticated trial limits.

## RAG API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/rag/documents` | List RAG documents. |
| `POST` | `/api/rag/documents` | Add one RAG document. |
| `DELETE` | `/api/rag/documents?id=...` | Delete one RAG document and chunks. |
| `PATCH` | `/api/rag/documents` | Backfill missing embeddings. |
| `POST` | `/api/rag/search` | Semantic search over RAG chunks. |

`POST /api/rag/search` body:

```ts
{ query: string; limit?: number; checkNeedsRag?: boolean }
```

## Voice API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/voice/generate` | Generate audio for an assistant message (plan + funnel checks apply). |

`POST /api/voice/generate` body:

```ts
{ messageId: string; userMessage?: string }
```

## Admin API

### Core admin endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/admin/analytics?type=...&range=...` | Dashboard analytics (`overview`, `usage`, `costs`, `funnel`). |
| `GET` | `/api/admin/costs` | Aggregated model cost metrics. |
| `GET` | `/api/admin/users` | User list with pagination/search. |
| `PATCH` | `/api/admin/users` | Update user role (`SUPER_ADMIN` only). |
| `GET` | `/api/admin/users/[userId]` | User detail with stats and recent messages. |
| `GET` | `/api/admin/rag` | List all RAG documents. |
| `POST` | `/api/admin/rag` | Upload/process RAG files (multipart `files`). |
| `DELETE` | `/api/admin/rag?id=...` | Delete RAG document. |
| `GET` | `/api/admin/organizations` | List organizations and seat usage (`?sync=1` supported). |
| `POST` | `/api/admin/organizations` | Create organization, contract, owner assignment/invite. |
| `GET` | `/api/admin/organizations/[organizationId]` | Organization detail. |
| `PATCH` | `/api/admin/organizations/[organizationId]` | Update metadata, contract, owner transfer. |
| `DELETE` | `/api/admin/organizations/[organizationId]` | Delete organization (Clerk + local). |
| `GET` | `/api/admin/organizations/[organizationId]/audit` | Paginated organization audit events. |
| `GET` | `/api/admin/elevenlabs/stats` | Voice generation statistics. |

### Benchmark endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/admin/benchmark` | List benchmark runs. |
| `POST` | `/api/admin/benchmark` | Create/start benchmark run. |
| `PATCH` | `/api/admin/benchmark` | Update benchmark run state. |
| `DELETE` | `/api/admin/benchmark` | Delete benchmark run. |
| `GET` | `/api/admin/benchmark/progress` | Current run progress. |
| `GET` | `/api/admin/benchmark/export` | Export benchmark results. |
| `GET` | `/api/admin/benchmark/test-cases` | List test cases. |
| `POST` | `/api/admin/benchmark/test-cases` | Create test case. |
| `DELETE` | `/api/admin/benchmark/test-cases` | Delete test case. |
| `GET` | `/api/admin/benchmark/adversarial` | List adversarial benchmark items. |
| `POST` | `/api/admin/benchmark/adversarial` | Create/run adversarial benchmark job. |
| `PATCH` | `/api/admin/benchmark/adversarial` | Update adversarial benchmark state. |

## Operations and Maintenance API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/health` | Health checks for DB, OpenRouter, Clerk, Blob. |
| `GET` | `/api/cron/trigger?job=all|consolidate|archive|analyze` | Publish maintenance jobs to QStash (`CRON_SECRET` required). |
| `GET` | `/api/cron/cleanup-attachments` | Run attachment cleanup (`CRON_SECRET` required). |
| `POST` | `/api/cron/cleanup-attachments` | Run attachment cleanup (`CRON_SECRET` required). |
| `POST` | `/api/queues/consolidate` | Internal QStash consumer for memory consolidation. |
| `POST` | `/api/queues/archive` | Internal QStash consumer for session archive. |
| `POST` | `/api/queues/analyze` | Internal QStash consumer for profile analysis. |

## Webhooks

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/webhooks/clerk` | Sync users, subscriptions, organizations, memberships. |
| `GET` | `/api/webhooks/telegram` | Telegram webhook health check. |
| `POST` | `/api/webhooks/telegram` | Telegram bot updates. |
| `GET` | `/api/webhooks/whatsapp` | WhatsApp verification challenge. |
| `POST` | `/api/webhooks/whatsapp` | WhatsApp Cloud API updates. |

## Error Responses

Common shape:

```ts
{
  error: string;
  code?: string;
  details?: object;
}
```

Typical status codes:

- `400` bad request
- `401` unauthorized
- `403` forbidden
- `404` not found
- `429` rate-limited
- `500` internal server error

## Related Documentation

- [Authentication](./authentication.md)
- [Rate Limiting](./rate-limiting.md)
- [Organizations](./organizations.md)
- [Maintenance](./maintenance.md)
