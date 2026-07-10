# Configuration

Copy [`.env.example`](../.env.example) to `.env` for local development and replace the placeholders. `.env` is ignored by Git; never commit credentials.

```bash
cp .env.example .env
```

The application validates some integrations when their modules are imported. In particular, normal chat execution currently requires OpenRouter, Tavily, and server-side PostHog configuration; Tavily is not optional at runtime even if a conversation never uses web search.

## Core application

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL runtime connection. A pooled Neon URL is appropriate. |
| `DIRECT_DATABASE_URL` | Recommended for migrations | Direct PostgreSQL connection used by Prisma CLI. When absent, Prisma falls back to `DATABASE_URL`. Builds do not apply migrations. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Browser-side Clerk configuration. |
| `CLERK_SECRET_KEY` | Yes | Server-side Clerk API access. |
| `OPENROUTER_API_KEY` | Yes | Chat generation, embeddings, transcription, and benchmarks. |
| `TAVILY_API_KEY` | Yes for chat | Web-search tool. The module currently throws when this is absent. |
| `POSTHOG_API_KEY` | Yes for chat | Server-side funnel events and AI tracing. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Recommended with PostHog | Shared PostHog host used by server tracing/events and browser analytics. Set the correct project region. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public base URL used for channel links and OpenRouter attribution headers. Use `http://localhost:3000` locally. |

`POSTHOG_API_KEY` and `NEXT_PUBLIC_POSTHOG_KEY` may be the same PostHog project token. The separate names reflect server and browser usage, not necessarily separate credentials.

### Data sent to providers

- OpenRouter receives the generated system prompt and conversation input, which can include profile, preferences, memories, history, RAG excerpts, and attached content.
- PostHog AI tracing runs with `posthogPrivacyMode: true`; model inputs and outputs are stored as null while operational metadata such as model, tokens, timing, and custom trace properties remains available.
- Tavily receives web-search queries chosen by the model.
- Chat uploads, RAG originals, and web-generated voice audio are stored with public Blob access. Treat their URLs as bearer-access URLs. Self-service account deletion explicitly removes owned attachment/artifact objects before local records, while normal database cascades alone do not remove Blob objects.

## Feature integrations

| Feature | Variables | Notes |
| --- | --- | --- |
| Clerk webhooks | `CLERK_WEBHOOK_SECRET` | Required only for `/api/webhooks/clerk`. |
| Browser analytics | `NEXT_PUBLIC_POSTHOG_KEY` | Client initialization is skipped when the public key is absent. The shared host is listed above. |
| File uploads | `BLOB_READ_WRITE_TOKEN` | Required by Vercel Blob uploads, RAG source-file storage, cleanup, and the Blob health check. Current upload/RAG/web-audio writes use public access; possession of a URL can expose the object. |
| Voice output | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_COST_PER_1000_CHARS_USD` | The voice ID has an application default; the API key enables generation. Set the cost variable to the effective USD rate for the active ElevenLabs plan so generated voice usage is included in cost totals. |
| QStash maintenance | `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | The QStash module validates URL/token at import time. Signing keys verify queue consumers. |
| Cron triggers | `CRON_SECRET` | Sent as `Authorization: Bearer ...` to cron endpoints. |
| Queue callback URL | `APP_URL` | Server-side base URL used when publishing QStash jobs. QStash cannot call `localhost`; local queue testing needs a public tunnel or deployed URL. This is distinct from `NEXT_PUBLIC_APP_URL`. |

## Telegram

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot API authentication and outbound delivery. |
| `TELEGRAM_BOT_USERNAME` | Redirect/deep-link target shown after account linking. |
| `TELEGRAM_WEBHOOK_SECRET` | Verifies `x-telegram-bot-api-secret-token`. |
| `TELEGRAM_SYNC_WEBHOOK=true` | Await the full handler before responding; useful for local debugging only. |
| `TELEGRAM_DISABLE_AI=true` | Persist/process inbound updates without generating an AI reply. |
| `TELEGRAM_DISABLE_SEND=true` | Suppress outbound Bot API calls. |

## WhatsApp

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone-number resource used for outbound delivery. |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API authentication. |
| `WHATSAPP_APP_SECRET` | Verifies `x-hub-signature-256` on webhook updates. |
| `WHATSAPP_VERIFY_TOKEN` | Verifies the initial webhook subscription challenge. |
| `WHATSAPP_SYNC_WEBHOOK=true` | Await the full handler before responding; useful for local debugging only. |
| `WHATSAPP_DISABLE_AI=true` | Disable AI replies. |
| `WHATSAPP_DISABLE_SEND=true` | Suppress outbound Meta API calls. |

## Tests and diagnostics

| Variable | Purpose |
| --- | --- |
| `TEST_DATABASE_URL` | Isolated database modified by integration tests. Never point it at production. |
| `LOG_PRISMA_QUERIES=true` | Emit Prisma query logs in development. |
| `ENABLE_LATENCY_LOGS=true` | Keep latency timing events enabled. |
| `APP_LOG_LEVEL` | `silent`, `error`, `warn`, `info`, or `debug`. |
| `APP_LOG_FORMAT` | `pretty` or `json`. |
| `APP_LOG_COLORS` | Set `false` to disable pretty-output colors. `true` does not override non-TTY or standard no-color settings. |
| `APP_LOG_DOMAIN_LEVELS` | Comma-separated overrides such as `auth:warn,ai:debug`. |
| `APP_LOG_EXCLUDE_EVENTS` | Comma-separated exact or `prefix.*` event filters. |

`VERCEL_URL`, `NODE_ENV`, and standard color variables are supplied by the platform/runtime and do not belong in the local template in normal use. `INTEGRATION_TEST_SCHEMA` is set by the integration-test bootstrap.

## Database mapping

Keep environments isolated:

| Environment | Database |
| --- | --- |
| Local development | Neon development branch or local PostgreSQL with pgvector. |
| Integration tests | Dedicated disposable branch/database, separate from local and production. |
| Vercel Preview | Isolated preview/development branch; never production. |
| Vercel Production | Production branch only. |

The repository's integration guard rejects a test URL with the same host as `DATABASE_URL`, but that guard is not a substitute for checking the connection strings yourself.
