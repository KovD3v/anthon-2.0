# API Reference

Anthon 2.0 exposes REST API endpoints for chat, data management, and administration.

## Authentication

All API routes (except webhooks) require Clerk authentication. The authenticated user is available via:

```typescript
import { auth } from "@clerk/nextjs/server";

const { userId } = await auth();
```

Many routes also use the internal helper:

```ts
import { getAuthUser } from "@/lib/auth";

const { user, error } = await getAuthUser();
```

## Chat API

### `POST /api/chat`

Streams an AI chat response.

**Request:**

```typescript
{
  chatId: string;
  messages: Array<{
    role: "user" | "assistant";
    parts?: Array<
      | { type: "text"; text: string }
      | {
          type: "file";
          mimeType?: string;
          name?: string;
          size?: number;
          attachmentId?: string;
          data?: string;
        }
    >;
  }>;
}
```

**Response:** Server-Sent Events stream with:

- Text chunks
- Tool calls/results
- Final message metadata

**Rate Limiting:** Enforced per subscription tier.

---

## Chats API

### `GET /api/chats`

List user's chats.

**Response:**

```typescript
{
  chats: Array<{
    id: string;
    title: string | null;
    visibility: "PRIVATE" | "PUBLIC";
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }>;
}
```

### `POST /api/chats`

Create a new chat.

**Request:**

```typescript
{
  title?: string;
}
```

### `GET /api/chats/[chatId]`

Get a single chat with messages.

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max messages |
| `cursor` | string | - | For pagination |

### `PATCH /api/chats/[chatId]`

Update chat title.

```typescript
{
  title?: string;
  visibility?: "PRIVATE" | "PUBLIC";
  generateTitle?: boolean;
}
```

### `DELETE /api/chats/[chatId]`

Delete a chat (hard delete; cascades to related messages/artifacts).

---

## Chat Export

### `GET /api/chats/[id]/export`

Downloads the chat as Markdown.

---

## Chat Search

### `GET /api/chats/search?q=...`

Searches within the user's messages (case-insensitive contains).

Notes:

- `q` must be at least 2 characters.
- Results are limited.

---

## Chat Messages API

This is used by the UI to load/edit/delete messages.

### `GET /api/chat/messages?chatId=<chatId>`

Returns message history for a chat.

### `PATCH /api/chat/messages`

Edits a user message by deleting that message and all subsequent messages in the same chat.

Body:

```ts
{ messageId: string; content?: string }
```

### `DELETE /api/chat/messages?id=<messageId>`

Deletes a user message and all subsequent messages in the same chat.

---

## Feedback API

### `POST /api/chat/feedback`

Stores thumbs up/down feedback for an assistant message.

Body:

```ts
{ messageId: string; feedback: -1 | 0 | 1 }
```

---

## RAG API

### `GET /api/rag/documents`

List all RAG documents.

**Response:**

```ts
{ documents: Array<{ id: string; title: string; source: string | null; url: string | null }> }
```

### `POST /api/rag/documents`

Add a new document.

**Request:**

```typescript
{
  title: string;
  content: string;
  source?: string;
  url?: string;
}
```

### `DELETE /api/rag/documents/[id]`

Delete a document and its chunks.

Note: the current implementation deletes via query param (`DELETE /api/rag/documents?id=...`).

### `PATCH /api/rag/documents`

Backfills missing embeddings (admin/dev utility).

### `POST /api/rag/search`

Search documents semantically.

**Request:**

```typescript
{
  query: string;
  limit?: number;  // Default: 5
  checkNeedsRag?: boolean;
}
```

**Response:** includes results and, optionally, a prebuilt context string.

---

## Usage API

### `GET /api/usage`

Get current user's daily usage and limits.

**Response:**

```typescript
{
  usage: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  }
  limits: {
    maxRequests: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxCostUsd: number;
  }
  tier: "TRIAL" | "ACTIVE" | "ADMIN";
  subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELED" | "EXPIRED" | "PAST_DUE" | null;
  entitlements?: {
    modelTier: "TRIAL" | "BASIC" | "BASIC_PLUS" | "PRO" | "ENTERPRISE" | "ADMIN";
    sources: Array<{
      type: "personal" | "organization";
      sourceId: string;
      sourceLabel: string;
    }>;
  };
}
```

---

## Upload API

### `POST /api/upload`

Upload a file to Vercel Blob.

**Request:** `multipart/form-data` with `file` field.

**Response:**

```typescript
{
  id: string;
  url: string; // Blob URL
  downloadUrl?: string;
  name: string;
  contentType: string;
  size: number;
}
```

Notes:

- If `chatId` is provided in the multipart form, the API verifies chat ownership and stores the file under a chat-specific path.

---

## Channels API

### `DELETE /api/channels/[id]`

Disconnects a channel identity (e.g. Telegram/WhatsApp) from the authenticated user.

---

## Admin API

Admin routes require `ADMIN` or `SUPER_ADMIN` role.

### `GET /api/admin/analytics?type=...&range=...`

Aggregated metrics for the admin dashboard.

- `type`: `overview` | `usage` | `costs` | `funnel`
- `range`: `7d` | `30d` | `90d` | `all`

### `GET /api/admin/users`

Lists users with pagination/search.

### `PATCH /api/admin/users`

Updates a user's role (SUPER_ADMIN only).

### `GET /api/admin/users/[userId]`

User detail + stats + recent messages.

### `GET /api/admin/rag`

Lists all RAG documents.

### `POST /api/admin/rag`

Uploads and processes one or more documents (multipart form field: `files`).

### `DELETE /api/admin/rag?id=<documentId>`

Deletes a RAG document and its chunks.

### `GET /api/admin/organizations`

Lists organizations with contract summary and active seat usage.

### `POST /api/admin/organizations`

Creates a Clerk organization, stores local contract limits, and assigns/invites the owner.

Contract payload notes:

- `basePlan` is required (`BASIC`, `BASIC_PLUS`, `PRO`).
- `modelTier` is an advanced override; if unchanged, it should match the base plan tier.
- Numeric contract fields are treated as enterprise overrides.

### `GET /api/admin/organizations/[organizationId]`

Returns organization details, contract, owner, and membership state.

### `PATCH /api/admin/organizations/[organizationId]`

Updates contract limits and/or initiates owner transfer.

Response notes (list/detail/create/update):

- Organization responses include `effective` when a contract is present.
- `effective` is computed from `basePlan` defaults plus explicit enterprise overrides.

### `GET /api/admin/organizations/[organizationId]/audit`

Returns immutable audit log entries for contract-sensitive actions.

---

## Health

### `GET /api/health`

Returns connectivity status for DB, OpenRouter, Clerk, and Vercel Blob.

---

## Webhooks

### `POST /api/webhooks/clerk`

Handles Clerk webhook events:

- `user.created` - Create user in database
- `user.updated` - Update user data
- `user.deleted` - Soft delete user
- `subscription.*` - Update subscription status
- `organization.*` - Sync organization lifecycle
- `organizationMembership.*` - Sync memberships, enforce seat limit on join
- `organizationInvitation.accepted` - Sync accepted owner/member invite flow

**Headers Required:**

- `svix-id`
- `svix-timestamp`
- `svix-signature`

### `POST /api/webhooks/telegram`

Receives Telegram Bot API updates and responds via `sendMessage`.

**Headers Required:**

- `x-telegram-bot-api-secret-token` (must match `TELEGRAM_WEBHOOK_SECRET`)

Clerk webhook secret:

- `CLERK_WEBHOOK_SECRET`

Optional:

- `NEXT_PUBLIC_APP_URL` (used to generate link URLs)
- `TELEGRAM_SYNC_WEBHOOK` (dev mode: process synchronously)
- `TELEGRAM_DISABLE_AI` / `TELEGRAM_DISABLE_SEND`

**Telegram Setup (example):**

```bash
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
	-d "url=https://YOUR_DOMAIN/api/webhooks/telegram" \
	-d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

---

## Error Responses

All endpoints return consistent error format:

```typescript
{
  error: string;      // Error message
  code?: string;      // Error code (e.g., "RATE_LIMIT_EXCEEDED")
  details?: object;   // Additional context
}
```

**Status Codes:**
| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not authenticated |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

## Related Documentation

- [Authentication](./authentication.md) - Clerk setup
- [Rate Limiting](./rate-limiting.md) - Usage limits
- [AI System](./ai-system.md) - Chat processing
