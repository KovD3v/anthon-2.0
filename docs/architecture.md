# Architecture

Anthon is a Next.js App Router application with four conversational entry points and one shared AI/persistence core.

## System map

```text
Browser UI          Telegram Bot API          Meta WhatsApp API
    |                       |                         |
    |                 signed webhooks           signed webhooks
    |                       |                         |
    +---- web/guest --------+------ channel adapters-+
                                 |
                       inbound persistence
                                 |
                         runChannelFlow()
                                 |
              +------------------+------------------+
              |                  |                  |
       entitlement resolver  AI orchestrator   channel options
              |                  |                  |
       plan/org catalog    context + RAG + tools   stream/text
                                 |
                       OpenRouter generation
                                 |
                    assistant persistence
                                 |
                  messages + usage + memories
                                 |
                      PostgreSQL / pgvector
```

The important seam is `src/lib/channel-flow`, not an individual API route. Adapters own ingress and egress; the shared runtime owns generation and assistant-side persistence.

## Application surfaces

| Surface | Location | Access model |
| --- | --- | --- |
| Marketing | `src/app/(marketing)` | Public |
| Chat | `src/app/(chat)` | Signed-in Clerk user or cookie-backed guest |
| Admin | `src/app/(admin)` | Clerk session plus `ADMIN`/`SUPER_ADMIN` database role |
| Clerk account | `src/app/sign-in`, `sign-up`, `organization` | Clerk-hosted components and session |
| Channel linking | `src/app/link/{telegram,whatsapp}/[token]` | One-time token plus signed-in target account |
| API | `src/app/api` | Route-specific Clerk, guest-cookie, role, secret, signature, or public access |

The root layout installs Clerk, theme, TanStack Query, motion, user identification, and toast providers. `src/proxy.ts` supplies an initial Clerk session gate for profile, admin, channel, and organization pages. Role and data ownership checks still happen in server layouts and route handlers.

## Channel adapters

| Channel | Entry point | Adapter responsibilities | Execution mode |
| --- | --- | --- | --- |
| Authenticated web | `POST /api/chat` | Clerk auth, subscription refresh, chat ownership, attachments, inbound message | Streaming |
| Guest web | `POST /api/guest/chat` | Guest cookie, guest chat ownership, attachment rejection, inbound message | Streaming |
| Telegram | `POST /api/webhooks/telegram` | Secret header, idempotency, media download, transcription, identity/linking, outbound text/voice | Accumulated text |
| WhatsApp | `POST /api/webhooks/whatsapp` | Meta verification/signature, idempotency, media download, transcription, identity/linking, outbound text/voice | Accumulated text |

Telegram and WhatsApp normally acknowledge the webhook before heavy processing and schedule it through Vercel `waitUntil`. `*_SYNC_WEBHOOK=true` makes the handler await the work for local debugging.

### Guest restrictions

Guest web chat deliberately disables:

- file attachments;
- memory extraction;
- voice output.

Telegram and WhatsApp may create guest users tied to a `ChannelIdentity`. Guest records can later be transactionally migrated into a registered Clerk-backed user.

## Shared channel runtime

`runChannelFlow(ctx)` in `src/lib/channel-flow/run.ts`:

1. Normalizes channel-specific text/file parts.
2. Detects image and audio inputs.
3. Calls `streamChat()` with the resolved entitlements and channel options.
4. Returns the AI SDK stream for web, or consumes it into text for external channels.
5. On completion, delegates assistant persistence to `persistAssistantOutput()`.
6. Invokes an optional completion hook when one is supplied. The current Telegram/WhatsApp handlers instead receive accumulated text and perform delivery after `runChannelFlow()` returns.

`persistAssistantOutput()` writes the assistant message and model metrics, updates the chat timestamp when applicable, increments UTC daily usage, revalidates requested cache tags, and optionally schedules memory extraction.

Inbound persistence remains adapter-owned because web chats, external message IDs, media metadata, and idempotency differ by channel.

## AI runtime

`streamChat()` in `src/lib/ai/orchestrator.ts` performs the shared generation path:

1. Resolve effective personal/organization entitlements.
2. Select the plan-routed OpenRouter model.
3. Build conversation history through the session manager.
4. Load profile/preferences and memories.
5. Decide whether RAG is useful and retrieve matching chunks when needed.
6. Build the sports-performance coaching system prompt.
7. Stream through Vercel AI SDK with memory, profile/preferences, and Tavily tools.
8. Extract model, token, cost, reasoning, timing, tool, and RAG metrics.

PostHog wraps the selected model for AI traces with privacy mode enabled, so model input/output content is omitted from trace events. OpenRouter provides generation, embeddings, and channel audio transcription. Tavily is exposed as the current-world web-search tool.

### Conversation context

- With a web `chatId`, history is scoped to that chat.
- Without a `chatId`, messages are grouped into sessions separated by 15-minute gaps.
- Long cross-channel sessions may use `SessionSummary` records and a recent-message fallback while summarization runs.
- Profile, preferences, memories, and RAG context are separate prompt inputs.

### RAG

- Documents are split into overlapping chunks.
- `openai/text-embedding-3-small` is called through OpenRouter.
- Embeddings are stored as `vector(1536)` in `RagChunk`.
- Retrieval uses cosine distance and a 0.6 similarity threshold.
- Query gating uses cached document existence, positive/negative heuristics, and an LLM classifier fallback.

The corpus is global; `RagDocument` and `RagChunk` have no user or organization owner.

## Plans and entitlements

`src/lib/plans/catalog.ts` is the policy source for canonical plans:

```text
GUEST, TRIAL, BASIC, BASIC_PLUS, PRO, ADMIN
```

It defines request/token/cost/context limits, attachment retention, model routing, and voice policy.

For a normal signed-in user, resolution builds a personal candidate and candidates from active organization memberships with valid contracts. It selects the strongest vector in this order:

1. model-tier priority;
2. request limit;
3. input-token limit;
4. output-token limit;
5. cost limit;
6. context-message limit;
7. stable source-ID tie break.

Guests skip organization resolution. `ADMIN` and `SUPER_ADMIN` resolve to the unlimited admin candidate.

## Data domains

| Domain | Main models |
| --- | --- |
| Identity and personalization | `User`, `Profile`, `Preferences`, `Memory` |
| Conversations | `Chat`, `Message`, `SessionSummary`, `ArchivedSession` |
| Channels | `ChannelIdentity`, `ChannelLinkToken` |
| Knowledge | `RagDocument`, `RagChunk` |
| Files and generated output | `Attachment`, `Artifact`, `ArtifactVersion` |
| Plans and accounting | `Subscription`, `DailyUsage`, `VoiceUsage` |
| Organizations | `Organization`, `OrganizationContract`, `OrganizationMembership`, `OrganizationAuditLog` |
| Evaluation | `BenchmarkRun`, `BenchmarkResult`, `BenchmarkTestCase` |

Prisma uses the `pg` adapter. A client extension hides `User`, `Chat`, and `Message` rows whose `deletedAt` is non-null from ordinary reads. It does not intercept delete operations; current delete paths are hard deletes unless a caller explicitly writes `deletedAt`.

## Background work

Maintenance has two layers:

1. `GET /api/cron/trigger` selects eligible users and publishes per-user jobs to QStash.
2. Signed queue consumers run memory consolidation, session archival, or profile analysis.

`job=all` publishes consolidation and archival. Profile analysis requires `job=analyze`.

Attachment cleanup is independent: `GET|POST /api/cron/cleanup-attachments` removes expired Blob objects and `Attachment` rows according to plan retention.

Only attachment cleanup is scheduled in the tracked `vercel.json`. The general maintenance trigger needs manual or external scheduling.

## External-service boundaries

| Service | Responsibility |
| --- | --- |
| Clerk | Web authentication, personal billing data, organizations, and signed lifecycle webhooks |
| PostgreSQL/Neon | Application state, usage, audit logs, and vectors |
| OpenRouter | Language models, embeddings, transcription, and benchmark model metadata |
| Tavily | Orchestrator web search |
| PostHog | Browser analytics, funnel events, and AI traces |
| Vercel Blob | Public-access chat attachments, optional RAG originals, and web-generated audio |
| Upstash QStash | Signed asynchronous maintenance delivery |
| ElevenLabs | Text-to-speech generation and credit status |
| Telegram/Meta | External message transport and media APIs |

## Operational constraints

- `src/lib/ai/tools/tavily.ts` and `src/lib/qstash.ts` validate configuration at module import, so missing variables can break an importing route or build.
- The Prisma client is initialized eagerly when `src/lib/db.ts` loads.
- `bun run build` generates Prisma Client and compiles without applying migrations; `bun run db:migrate:deploy` is the explicit release migration step.
- Integration tests enable pgvector and run `prisma db push` against `TEST_DATABASE_URL`.
- Public `/api/health` performs only a shallow process-liveness check. `/api/health?details=1` requires an admin role and performs live provider checks; its Blob check is a read-only one-item list. The admin dashboard uses the same shared checker.
- Blob uploads are written with public access, and database cascades do not delete external objects.

See [Configuration](./configuration.md) and [Deployment](./deployment.md) before changing runtime or build environments.

## Related references

- [AI System](./ai-system.md)
- [Database](./database.md)
- [Authentication](./authentication.md)
- [API Reference](./api.md)
- [Maintenance](./maintenance.md)
