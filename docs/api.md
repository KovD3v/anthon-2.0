# API Reference

Anthon 2.0 exposes REST API endpoints for chat, data management, and administration.

## Authentication

All API routes (except webhooks) require Clerk authentication. The authenticated user is available via:

```typescript
import { auth } from "@clerk/nextjs/server";

const { userId } = await auth();
```

## Chat API

### `POST /api/chat`

Streams an AI chat response.

**Request:**

```typescript
{
  userMessage: string;
  chatId?: string;         // Optional, creates new chat if not provided
  messageParts?: Array<{   // For multimodal (images)
    type: "text" | "image";
    text?: string;
    data?: string;         // Base64 image data
    mimeType?: string;
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

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Max chats to return |
| `cursor` | string | - | Pagination cursor |

**Response:**

```typescript
{
  chats: Array<{
    id: string;
    title: string | null;
    updatedAt: string;
    messageCount: number;
  }>;
  nextCursor?: string;
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
  title: string;
}
```

### `DELETE /api/chats/[chatId]`

Delete a chat (soft delete).

---

## Messages API

### `GET /api/chats/[chatId]/messages`

Get paginated messages for a chat.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Messages per page |
| `before` | string | Cursor for older messages |

### `DELETE /api/chats/[chatId]/messages/[messageId]`

Delete a message (soft delete).

---

## RAG API

### `GET /api/rag/documents`

List all RAG documents.

**Response:**

```typescript
Array<{
  id: string;
  title: string;
  source: string | null;
  chunkCount: number;
  createdAt: string;
}>;
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

### `POST /api/rag/search`

Search documents semantically.

**Request:**

```typescript
{
  query: string;
  limit?: number;  // Default: 5
}
```

**Response:**

```typescript
Array<{
  content: string;
  title: string;
  similarity: number;
}>;
```

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
    maxRequestsPerDay: number;
    maxInputTokensPerDay: number;
    maxOutputTokensPerDay: number;
    maxCostPerDay: number;
  }
  percentUsed: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }
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
  url: string; // Blob URL
  contentType: string;
  size: number;
}
```

---

## Admin API

Admin routes require `ADMIN` or `SUPER_ADMIN` role.

### `GET /api/admin/users`

List all users with stats.

### `GET /api/admin/stats`

Get system-wide statistics.

### `POST /api/admin/rag/upload`

Bulk upload RAG documents.

---

## Webhooks

### `POST /api/webhooks/clerk`

Handles Clerk webhook events:

- `user.created` - Create user in database
- `user.updated` - Update user data
- `user.deleted` - Soft delete user
- `subscription.*` - Update subscription status

**Headers Required:**

- `svix-id`
- `svix-timestamp`
- `svix-signature`

### `POST /api/webhooks/telegram`

Receives Telegram Bot API updates and responds via `sendMessage`.

**Headers Required:**

- `x-telegram-bot-api-secret-token` (must match `TELEGRAM_WEBHOOK_SECRET`)

**Environment Variables:**

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

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
