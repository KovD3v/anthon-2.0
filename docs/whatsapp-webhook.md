# WhatsApp Webhook

Complete documentation of the WhatsApp Cloud API webhook integration, covering message handling, media processing, user management, and AI integration.

## Overview

The WhatsApp webhook receives updates from the WhatsApp Cloud API, processes user messages (text, voice, photos, documents), and generates AI responses using the orchestrator.

```mermaid
flowchart LR
    A[WhatsApp User] --> B[WhatsApp Cloud API]
    B --> C[Webhook Endpoint]
    C --> D[Process Message]
    D --> E[AI Orchestrator]
    E --> F[Send Response]
    F --> B
    B --> A
```

## Endpoint

| Method | Path                     | Description               |
| ------ | ------------------------ | ------------------------- |
| `POST` | `/api/webhooks/whatsapp` | Receives WhatsApp updates |
| `GET`  | `/api/webhooks/whatsapp` | Verification Request      |

### Authentication

The webhook is authenticated in two ways:

1. **Verification (GET)**: Uses `WHATSAPP_VERIFY_TOKEN` (hub.verify_token).
2. **Updates (POST)**: Validates `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET`.

## Message Flow

### Complete Request Lifecycle

```mermaid
sequenceDiagram
    participant WA as WhatsApp
    participant WH as Webhook
    participant DB as Database
    participant AI as Orchestrator

    WA->>WH: POST /api/webhooks/whatsapp
    WH->>WH: Verify signature (X-Hub-Signature-256)

    alt Invalid Signature
        WH-->>WA: 401 Unauthorized
    end

    WH-->>WA: 200 OK (immediate)

    Note over WH: Background processing starts

    WH->>WH: Parse update (extract WAMID)
    WH->>DB: Check idempotency

    alt Already processed
        WH->>WH: Skip (duplicate)
    end

    WH->>DB: Find/create user (by phone number)
    WH->>DB: Check rate limit

    alt Rate limited
        WH->>WA: Send limit message
    end

    WH->>DB: Save inbound message
    WH->>AI: streamChat()
    AI-->>WH: Stream response
    WH->>DB: Save assistant message
    WH->>WA: sendMessage()
```

## Message Types

### Text Messages

```mermaid
sequenceDiagram
    participant U as User
    participant WH as Webhook
    participant AI as Orchestrator

    U->>WH: Text message
    WH->>WH: Extract body
    WH->>AI: streamChat(text)
    AI-->>WH: Response
    WH->>U: Send text response
```

### Audio/Voice Messages

```mermaid
sequenceDiagram
    participant U as User
    participant WH as Webhook
    participant WA as WhatsApp API
    participant TR as OpenRouter
    participant AI as Orchestrator

    U->>WH: Audio message
    WH->>WA: Get media URL (GET /<media_id>)
    WA-->>WH: Media URL
    WH->>WA: Download media (with Access Token)
    WA-->>WH: Audio binary
    WH->>WH: Convert to base64
    WH->>TR: Transcribe audio
    TR-->>WH: Transcribed text
    WH->>AI: streamChat(transcription)
    AI-->>WH: Response
    WH->>U: Send text response
```

### Image/Document Messages

```mermaid
sequenceDiagram
    participant U as User
    participant WH as Webhook
    participant WA as WhatsApp API
    participant AI as Orchestrator

    U->>WH: Image/Document
    WH->>WA: Get media URL (GET /<media_id>)
    WA-->>WH: Media URL
    WH->>WA: Download media
    WA-->>WH: Binary data
    WH->>WH: Convert to base64
    WH->>AI: streamChat(file + caption)
    Note over AI: Vision model enabled
    AI-->>WH: Response about media
    WH->>U: Send text response
```

## User Management

### User Resolution Flow

```mermaid
flowchart TD
    A[Receive Message] --> B{Identity exists?}
    B -->|Yes| C[Get linked User]
    B -->|No| D[Create Guest User]
    D --> E[Create Channel Identity (WHATSAPP)]
    E --> F[Link to Guest User]
    C --> G[Continue processing]
    F --> G
```

### Account Linking (`/connect` command)

```mermaid
sequenceDiagram
    participant U as WhatsApp User
    participant WH as Webhook
    participant DB as Database
    participant Web as Web App

    U->>WH: /connect
    WH->>DB: Check if already linked

    alt Already linked
        WH->>U: "Already connected"
    else Not linked
        WH->>DB: Create ChannelLinkToken
        WH->>U: Send link URL
        U->>Web: Open link
        Web->>DB: Validate token
        Web->>DB: Link identity to user
        Web->>U: "Connected!"
    end
```

## Data Structures

### Payload Structure

```typescript
type WhatsAppPayload = {
	object: "whatsapp_business_account";
	entry: {
		id: string;
		changes: {
			value: {
				messaging_product: "whatsapp";
				metadata: {
					display_phone_number: string;
					phone_number_id: string;
				};
				contacts?: {
					profile: { name: string };
					wa_id: string;
				}[];
				messages?: {
					from: string;
					id: string; // WAMID
					timestamp: string;
					type: "text" | "image" | "audio" | "document";
					text?: { body: string };
					image?: { id: string; caption?: string; mime_type: string };
					audio?: { id: string; mime_type: string };
					document?: {
						id: string;
						caption?: string;
						filename: string;
					};
				}[];
			};
			field: "messages";
		}[];
	}[];
};
```

## Environment Variables

| Variable                   | Required | Description                           |
| -------------------------- | -------- | ------------------------------------- |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes      | Phone Number ID from Meta             |
| `WHATSAPP_ACCESS_TOKEN`    | Yes      | System User Access Token              |
| `WHATSAPP_APP_SECRET`      | Yes      | App Secret for signature verification |
| `WHATSAPP_VERIFY_TOKEN`    | Yes      | Custom token for webhook verification |
| `WHATSAPP_SYNC_WEBHOOK`    | No       | Run synchronously (dev mode)          |
| `WHATSAPP_DISABLE_AI`      | No       | Disable AI responses                  |
| `WHATSAPP_DISABLE_SEND`    | No       | Disable sending messages              |

## Webhook Setup

1. Go to **WhatsApp Manager** > **Configuration**.
2. Click **Edit** callback URL.
3. Enter URL: `https://your-domain.com/api/webhooks/whatsapp`.
4. Enter Verify Token: matches `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe to fields: `messages`.
