# Changelog

All notable changes to Anthon 2.0 will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Version numbers describe the application's user-facing behavior and its documented API and channel-integration contracts. Versions before 1.0.0 represent initial development. The historical versions below are retrospective release candidates reconstructed from verified, non-overlapping Git milestones; they were not original published releases, and their links point to exact commits or commit ranges because matching release tags did not exist.

## [Unreleased]

### Added

- Added an Italian Anthon authentication shell and custom Clerk Core 3 flows for
  password and social sign-in, registration, email verification, client trust,
  SMS/TOTP/backup-code MFA, OAuth requirements, and password recovery.
- Added allowlisted post-auth continuations, legal URL validation, bot-protection
  placement, session-task routes, and focused auth regression coverage.

### Changed

- Upgraded `@clerk/nextjs` to v7, moved the provider inside `<body>`, migrated
  auth conditions to `Show`, and changed marketing auth actions from modal
  components to explicit routes.
- Kept Clerk account and organization components while presenting rare session
  tasks inside the Anthon shell.

## [0.5.1] - 2026-08-01

July reliability-audit hardening for chat, channels, multimodal inputs, and
delivery state.

### Added

- Durable usage, upload-quota, guest-abuse, web-idempotency, and external-inbound
  reservations with lease recovery and exact reconciliation.
- Durable attachment ownership with owner-scoped claiming, deletion, and
  canonical media validation.
- Stream cancellation settlement, successful-persistence barriers, retry
  recovery, and voice-first recovery paths.
- Concurrency protection and replay coverage for model experiments, cadence,
  lifecycle transitions, and result aggregation.
- Trusted-persistence CI coverage with scoped Neon, Clerk, and E2E credentials.

### Changed

- Hardened multimodal inputs with HTTPS/blob ownership checks, bounded DNS and
  redirects, size/MIME/magic-byte validation, and aggregate limits.
- Preserved OpenRouter priority routing at the provider boundary and emitted
  metadata-only AI generation telemetry.
- Removed duplicate RAG retrieval and narrowed result selections to scalar
  fields.
- Upgraded the supported framework and test toolchain, including Next.js
  16.2.12, Prisma 7.9.1, Vitest 4.1.10, and Vite 8.2.0.
- Made Playwright startup deterministic by warming the guest-chat route and
  waiting for persisted assistant controls before reload assertions.
- Refreshed reliability, database, API, rate-limit, onboarding, and plan
  documentation; removed the stale Knip inventory.

### Fixed

- Admin-gated the legacy global RAG API and applied Clerk security patches.
- Preserved fail-closed authorization and ownership checks across attachments,
  chat, uploads, and channel flows.
- Added bounded guest-abuse controls using separate token hashing and abuse
  identity state.

### Verification

- 1,426 unit tests passed and 4 were skipped; branch coverage is 75.65%.
- 42/42 disposable-Neon integration tests passed.
- 4/4 desktop/mobile Playwright tests passed.
- Production build generated 48 static pages.
- Both new migrations passed a disposable production-clone rehearsal, including
  verification of the reservation tables, and the clone was deleted afterward.

### Remaining advisories

`bun audit` is reduced to 12 advisories (6 high, 6 moderate). The remaining
findings are pinned or incompatible transitives under Next.js, Prisma Studio,
AI SDK devtools, Knip, and Vitest; no unsafe cross-major override was applied.

## [0.5.0] - 2026-07-31

Coaching lifecycle, resilient multimodal channels, and evidence-based model promotion.

### Added

- PDF and video attachments, direct multimodal OpenRouter responses, and regression coverage for image, document, and channel flows.
- Structured negative-feedback reasons and a simpler persistent response-feedback experience.
- A performance-editorial marketing system with interactive coaching scenarios, responsive navigation, stronger contrast, and restrained motion.
- A TurnPlan contract with explicit prompt profile, response length, input origin, output mode, history policy, capabilities, and persisted conversation-thread context.
- Unified voice-delivery policy, persisted voice decisions, low-latency suitability classification, and clearer automatic-delivery explanations.
- Paired model comparisons, blind quality evaluation, guarded promotion design, and an isolated browser gate for guest conversations.
- A coaching lifecycle covering lossless guest conversion, non-decreasing entitlements, transparent AI identity, user-controlled coaching context, and deterministic returning check-ins.
- A Luna versus DeepSeek V4 Flash 0731 reality benchmark with stricter success validation.

### Changed

- Promoted Luna with OpenAI priority routing as the default orchestrator after Italy-side latency, cost, reliability, and blind-quality evaluation.
- Consolidated web, Telegram, and WhatsApp connection handling around a shared lifecycle.
- Moved production database migrations into the Vercel build flow.
- Made marketing language more direct and authenticated product navigation more consistent.

### Fixed

- Preserved recent and complete conversation history across fast paths, reduced payloads, equal timestamps, and legacy planner fallback.
- Made inbound channel processing retryable and bounded external media downloads.
- Corrected image routing, OpenRouter REST handling, valid stream completion, RAG intent behavior, and embedding operations.
- Prevented unsolicited voice fallback, persisted classifier diagnostics, enabled local generation without a queue, and removed fixed job-expiry assumptions.
- Stabilized CI type generation and Prisma generation requirements.

### Security

- Bounded inbound media processing and expanded webhook, multimodal, guest, stateful-chat, and disposable-database regression coverage.

## [0.4.0] - 2026-06-30

Reality-based model selection, provider-aware routing, and faster chat responses.

### Added

- Curated model and scenario sets, judged reality benchmarks, timeout and failure diagnostics, cost reporting, rankings, plots, and repeatable benchmark runs.
- Cost-aware, risk-adjusted, and latency-aware OpenRouter provider routing with recent-failure penalties.
- TinyFish search and fetch tools with live ground-truth checks and bounded calls.
- Conservative simple-fast planning for small talk and brief replies while retaining compact memory and identity context.
- Live performance checks, tool-activity feedback, persisted message metrics, and response-path database indexes.
- Whisper Turbo transcription and streamed usage metadata.

### Changed

- Replaced the legacy benchmark stack with the reality benchmark and LLM judge.
- Replaced Tavily with TinyFish for web research.
- Reduced first-response latency by gating RAG, prompt modules, tools, history, preflight work, and provider selection.
- Improved Italian chat titles, response feedback, assistant-bubble stability, and light/dark visual contrast.
- Evolved the default orchestration model using measured benchmark evidence and provider health.

### Fixed

- Repaired chat cache invalidation, memory-extraction parsing, streamed usage metadata, and OpenRouter usage normalization.
- Stabilized assistant message lifecycle, guest-chat performance, title generation, and feedback states.
- Avoided rate-limited providers and removed hardcoded provider routing.
- Corrected multimodal image routing, web-search intent for live information, stream iteration, and landing-page composer behavior.
- Hardened benchmark scoring, judging, candidate timeouts, provider failures, and result typing.

### Removed

- Removed the superseded benchmark implementation after the reality benchmark became canonical.

## [0.3.2] - 2026-05-30

Reliability, validation, usage accounting, and low-latency guest chat.

### Added

- Web voice preflight, audio-upload handling, memory fallback, and improved mobile chat behavior.
- Fast paths for new and guest chats with prompt compaction and latency instrumentation.
- AI usage metering across chat support, channels, voice, and maintenance work.
- Focused chat-layout tests and project automation guidance.

### Changed

- Skipped disabled memory and unnecessary RAG checks for obvious conversational replies.
- Started new conversations directly from the first prompt and reduced guest-title and history work before streaming.
- Shared external-channel inbound assembly and rate-limit messaging across Telegram and WhatsApp.

### Fixed

- Added strict body, parameter, identifier, title, visibility, preference, RAG, voice, benchmark, and adversarial-case validation.
- Required administrative access for benchmark progress, exports, deletion, and role changes.
- Enforced chat ownership before rate-limit and billing synchronization.
- Preserved assistant persistence when downstream side effects fail and surfaced external AI, persistence, rate-limit, media, transcription, and stream failures.
- Prevented duplicate web and external-channel voice fallbacks.
- Stabilized chat history degradation, pending states, custom-title migration, browser effects, audio cleanup, organizations, and benchmark views.
- Hardened WhatsApp configuration, channel policies, rate limits, Telegram voice usage, and web attachment data.

### Security

- Required a configured cron secret and moved request validation ahead of authentication, billing, rate-limit, persistence, and external side effects.
- Strengthened owner and administrator checks across chats, attachments, benchmarks, RAG, users, and preferences.

## [0.3.1] - 2026-03-28

Platform maintainability, a coherent motion system, and database groundwork.

### Added

- Shared motion constants, animated page headers, grids, KPI cards, route transitions, and missing reusable interface components.
- Confirmed account deletion and member-scoped organization visibility.
- Database cleanup design and implementation phases with reasoning-token accounting and structural improvements.

### Changed

- Completed the migration from NextRequest to the standard Web Request API.
- Updated the Next.js and React toolchain and migrated PostCSS configuration to TypeScript.
- Replaced ad hoc server logging with the structured logger across AI, libraries, and API routes.
- Removed dead code and unused exports identified by Knip.
- Standardized marketing, chat, and admin motion, typography, spacing, and reduced-motion behavior.
- Renamed Preferenze to Impostazioni and refined profile navigation.

### Fixed

- Corrected organization navigation for users without memberships.
- Repaired page-wrapper sizing, suggestion-card presentation, animation imports, class composition, and RAG false-positive behavior.

### Security

- Restricted organization visibility to actual members and documented the remaining integration boundary.

## [0.3.0] - 2026-02-20

Organizations, entitlement plans, observability, and comprehensive test infrastructure.

### Added

- Clerk organization management, contracts, profile-name synchronization, and organization webhook handling.
- A unified plan catalog and resolver for model access, rate limits, voice configuration, retention, paid plans, and trial behavior.
- Chat usage views, upgrade guidance, paywall calls to action, subscription synchronization, and first-submit trial activation.
- Vitest coverage gates, a disposable-Neon integration harness, and broad API, AI, organization, webhook, RAG, and shared-library coverage.
- Structured logging across authentication, usage, AI, voice, organizations, administration, and webhooks.
- Funnel analytics across web and channel flows plus a redesigned administrative conversion view.
- React Query and LazyMotion providers, virtualized chat extraction, and actionable maintenance-job controls.

### Changed

- Upgraded the AI SDK and migrated affected APIs.
- Extracted shared channel-flow handlers and simplified admin/chat hooks.
- Migrated administrative analytics, costs, voice, benchmark, and dataset screens to query-based data loading.
- Consolidated plan-derived model routing, entitlements, usage tiers, and organization contracts.
- Standardized route handlers on the Web Request API.

### Fixed

- Repaired Clerk billing compatibility, organization access, contract selection, build typing, provider typing, and API revalidation.
- Validated route parameters and enforced attachment ownership.
- Improved chat deletion, usage presentation, sidebar behavior, and reduced-motion accessibility.

### Security

- Removed Telegram token debug logging and expanded authorization and ownership coverage through unit and real-database tests.

## [0.2.0] - 2025-12-27

Channels, voice, guest access, maintenance, analytics, and model benchmarking.

### Added

- Tavily-backed web research and cached memory/user-context prompts.
- Telegram webhooks, account-link tokens, channel management, text, photo, document, and audio processing, plus user-facing delivery feedback.
- Audio recording and playback, transcription, attachment retention, chat renaming, and ElevenLabs voice generation with administrative controls.
- Guest chat APIs, lossless guest-data migration, authentication screens, responsive mobile layouts, and safe-area handling.
- WhatsApp webhooks, documentation, account linking, and shared user identity.
- Administrative cost reporting and a benchmark system with datasets, adversarial cases, consensus judging, comparisons, and results.
- QStash maintenance queues, cron jobs, data-retention policies, user preferences, and PostHog analytics.
- Chat custom-title state and improved title and soft-delete behavior.

### Changed

- Upgraded Prisma and the AI SDK, externalized PostgreSQL support, and improved streamed chat session management.
- Improved mobile scrolling, sidebar behavior, client-side chat streaming, and usage presentation.
- Simplified memory extraction and documented the database schema-change workflow.

### Fixed

- Hardened Telegram response handling, audio multipart encoding, transcription, linking, and cached-user date handling.
- Gracefully handled dynamic authentication and cookie access during guest rendering.
- Corrected mobile safe areas and attachment/session edge cases.

### Security

- Added guest and Telegram rate limits, expiring channel-link tokens, attachment cleanup, and retention controls.

## [0.1.0] - 2025-12-09

Initial web coaching-chat foundation.

### Added

- The Next.js application shell with separate marketing, chat, and administrative route groups.
- Clerk user synchronization and authenticated chat layouts.
- Streaming AI chat with plan-based models, usage and reasoning metrics, contextual indicators, suggestions, and cost accounting.
- Vercel Blob uploads and deletion, multiple attachments, upload progress, PDF parsing, and message-linked files.
- RAG ingestion and retrieval with embeddings, retries, configurable similarity, and user-upload sources.
- Session management, fallback history, AI session caching, Prisma extensions, and user-context tools.
- Search, pagination, export, feedback, soft deletion, and reusable chat components.
- Italian localization, responsive navigation, light and dark themes, and prefetching.
- Database, OpenRouter, Clerk, and Vercel Blob health checks.
- Database indexes, direct migration connectivity, structured message persistence, and latency instrumentation.

[Unreleased]: https://github.com/KovD3v/anthon-2.0/compare/76213f0...HEAD
[0.5.1]: https://github.com/KovD3v/anthon-2.0/tree/76213f0
[0.5.0]: https://github.com/KovD3v/anthon-2.0/compare/f90c811d6e9b2aaa76857a862fba85821f45b0c3...a5e410573d6435a2d1ad3207f7ab1dc7669df2e3
[0.4.0]: https://github.com/KovD3v/anthon-2.0/compare/1f04b9919f88ac9c4e07c9cc71467248571c808a...f90c811d6e9b2aaa76857a862fba85821f45b0c3
[0.3.2]: https://github.com/KovD3v/anthon-2.0/compare/586d2d66d5678d07e7f25c443028e3dac32bdcdf...1f04b9919f88ac9c4e07c9cc71467248571c808a
[0.3.1]: https://github.com/KovD3v/anthon-2.0/compare/d786582a79936b47e3b01bb7c54afde6146803cb...586d2d66d5678d07e7f25c443028e3dac32bdcdf
[0.3.0]: https://github.com/KovD3v/anthon-2.0/compare/1d56c5a05e8071a94a2685ebd658e7f0152347b6...d786582a79936b47e3b01bb7c54afde6146803cb
[0.2.0]: https://github.com/KovD3v/anthon-2.0/compare/2ed3a800d43680ab08d4cc0a3b40348fbfc09a66...1d56c5a05e8071a94a2685ebd658e7f0152347b6
[0.1.0]: https://github.com/KovD3v/anthon-2.0/tree/2ed3a800d43680ab08d4cc0a3b40348fbfc09a66
