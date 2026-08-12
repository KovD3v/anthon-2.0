# Changelog

All notable changes to Anthon 2.0 will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Version numbers describe the application's user-facing behavior and its documented API and channel-integration contracts. Versions before 1.0.0 represent initial development. The historical versions below are retrospective release candidates reconstructed from verified, non-overlapping Git milestones; they were not original published releases, and their links point to exact commits or commit ranges because matching release tags did not exist.

## [Unreleased]

### Added

- Added a fail-closed light/standard execution-routing rollout with a unified
  classifier proposal, immutable route traces, shared Web/Telegram/WhatsApp
  kill switch, and a 36-fixture bilingual live evaluation command.
- Added proactive, bounded durable-fact recall and current-thread-first search
  over past conversations, with opaque evidence expansion, asynchronous
  indexing, resumable backfill, and an offline 30-scenario benchmark.
- Added fail-closed `off`, `shadow`, and `active` recall modes, independent
  capability votes, closed tool policy, and privacy-safe tool-funnel metrics.
- Added a discreet non-interactive “Ricordo” chat indicator when active recall
  materially contributes facts or conversation evidence.

- Added a reproducible conversational-quality benchmark with ten synthetic
  Italian coaching scenarios, fixed-Luna baseline/candidate artifacts, blind
  pairwise judging, structural diagnostics, and a CLI for replicated runs.
- Added bounded concurrent execution for independent benchmark replicas and
  judges while preserving conversation order and deterministic pair identity.
- Added an authenticated routine collection with reusable coaching routines
  that can be launched in a new chat, run inline through timers, breathing
  sequences, and structured check-ins, and reviewed in a dated attempt history.
- Added staged PostHog rollout control for the routine loop through the
  `routine-loop-v1` feature flag, with fail-closed access for regular and guest
  users and administrator access for validation.
- Added a user preference for showing technical response metrics, enabled by
  default for administrators and superadmins.
- Added per-turn capability arbitration so Anthon can compose contextual RAG,
  web search, guarded memory operations, routine proposals, and voice delivery
  according to each message.
- Documented user plan states, daily text and voice limits, OpenRouter cost
  estimates, plan economics, and the intended Clerk pricing and benefits UX.
- Added production-build instant-navigation regression coverage for guest chat
  links and direct conversation loads on desktop and mobile, backed by an
  ephemeral Neon branch.
- Added period-based grouping to the chat sidebar for today, yesterday, the
  last 7 days, the last 30 days, and older conversations.
- Added Italian Terms of Use and Privacy pages covering AI limitations, acceptable use, channels, data processing, retention, cookies, GDPR rights, and account deletion.
- Added public footer links to the Terms of Use and Privacy pages.
- Added an Italian Anthon authentication shell and custom Clerk Core 3 flows for
  password and social sign-in, registration, email verification, client trust,
  SMS/TOTP/backup-code MFA, OAuth requirements, and password recovery.
- Added allowlisted post-auth continuations, legal URL validation, bot-protection
  placement, session-task routes, and focused auth regression coverage.
- Added automatic PostHog source-map uploads during production builds, with
  uploaded maps removed afterward.
- Added a live elapsed-time indicator while recording voice messages.

### Changed

- Refined motion across chat, routines, search, shared popups, navigation, and
  progress indicators with interruptible transitions, compositor-friendly
  transforms, consistent easing, reduced-motion behavior, and steadier focus
  handling when the desktop sidebar collapses.
- Routed active light-profile turns through DeepSeek V4 Flash 0731 using a
  latency-sorted OpenRouter pool limited to Together, CoreWeave, and Ambient,
  while retaining the plan-resolved standard model for standard turns and
  pre-stream escalations.
- Replaced generic chat suggestions with focused coaching starters for
  performance anxiety, confidence, important-match preparation, and open-ended
  situations, and removed the separate desktop “Conversazione libera” action
  while keeping the composer available for any topic.
- Kept mental-performance support inside Anthon instead of referring users to
  outside coaching or psychology providers, while retaining brief medical or
  emergency direction for recurring physical symptoms, injury, or immediate
  danger.
- Enabled the agentic capability planner for Preview deployments through
  `AI_CAPABILITY_PLANNER_MODE`, while keeping Production on the legacy planner
  for staged validation.
- Removed the redundant safety-limit instructions from the full, guest, and
  compact system prompts, relying on the model's built-in safety behavior.
- Recentered competition-related bodily reactions on mental-performance
  coaching, removed health and safety intent routing, and kept generic medical
  reminders out of Anthon's coaching instructions and benchmark anchors.
- Refined the mobile chat entry flow by centering the landing content,
  hiding secondary starter actions, compacting the returning-chat card, and
  exposing authenticated file-upload and voice-recording entrypoints with
  attachment forwarding into the first chat turn.
- Kept conversation export available on tablet and desktop while removing it
  from the mobile conversation header to reduce header clutter.
- Reduced the height of message action and feedback controls for a denser chat
  layout across both user and assistant messages.
- Improved chat responsiveness by ending the response-settling state as soon
  as streamed output finishes, while reconciling persisted messages in the
  background.
- Improved first paint on the landing and chat routes by streaming conversation
  content independently of sidebar data, parallelizing sidebar reads, reducing
  the initial message window, deferring usage and analytics work, and keeping
  hero content visible during initial render.
- Refined Anthon's conversational strategy to decide when context is sufficient
  for a direct answer, when one high-value diagnostic question is needed, and
  how to carry identity corrections and known facts across turns without a
  fixed acknowledgment-list-question format.
- Refined the mobile coaching surface with a top-anchored empty state,
  compact starter actions, width-safe assistant responses, and a keyboard-aware
  composer that keeps the send control visible while preserving mobile
  multiline input and desktop submission.
- Changed routine repeats to reuse the saved routine definition in a new chat
  instead of generating a duplicate routine card.
- Changed routine responses and chat controls to prioritize coaching content,
  with technical details and secondary actions available progressively.
- Exposed persisted voice-fallback reasons in chat and linked trial voice
  fallbacks to the pricing page.
- Upgraded to Next.js 16.3 and React 19.2.8, enabled Cache Components, and
  migrated `/chat` and `/chat/[id]` to partial prerendering with meaningful
  layout and conversation fallbacks while dynamic data streams.
- Upgraded `@clerk/nextjs` to v7, moved the provider inside `<body>`, migrated
  auth conditions to `Show`, and changed marketing auth actions from modal
  components to explicit routes.
- Kept Clerk account and organization components while presenting rare session
  tasks inside the Anthon shell.
- Raised the registered-user daily message allowance to support beta usage.
- Reworked voice-message composition so a recorded or uploaded audio file
  replaces the text composer with a compact inline player and removal action.
- Simplified recording feedback and refined audio controls, progress, metadata,
  and error states inside the composer.
- Tuned natural voice-cadence selection with a lower confidence threshold for
  more responsive automatic voice delivery.

### Fixed

- Hardened light/standard execution routing by failing closed for empty task
  allowlists, preserving route provenance through fallback paths, requiring
  bounded recent context when a light turn depends on it, and ignoring
  supplied transformation payloads when estimating response brevity.
- Kept the chat composer coherent while voice recording or upload is active by
  hiding conflicting attachment, text, and send controls until the recorder is
  ready.
- Kept the assistant response bubble continuous from loading through streaming
  and persistence, showing its relative timestamp immediately and reserving
  toolbar space so technical details and feedback controls do not shift layout.
- Extended the stable streaming and feedback-toolbar layout to desktop chat,
  keeping timestamps, technical details, and controls from causing a late
  bubble shift there as well.
- Prevented iOS Safari from zooming the chat composer on focus by keeping the
  mobile input text at the native 16px minimum while preserving the denser
  desktop scale.
- Fixed the mobile chat landing layout by keeping the writing composer visible
  below the scrollable welcome content and arranging starter situations in a
  compact two-column grid.
- Fixed scrolling in the chat sidebar by allowing the conversation list to
  shrink within the available viewport height.
- Hardened routine lifecycle recovery across source chats, returning check-ins,
  concurrent mutations, and orphaned routines.
- Fixed the initial routine action so “La provo ora” persists the proposal and
  opens its inline widget without sending a duplicate AI turn; guests are sent
  to registration instead.
- Prevented duplicate AI turns when repeating a saved routine and preserved
  routine attempt outcomes with their dates and richer optional feedback.
- Localized voice-unavailability explanations in Italian for trial, preference,
  provider, and quota fallbacks.
- Scoped chat composer keyboard behavior by viewport: Enter creates a new line
  on mobile, submits on desktop, and Shift+Enter remains available for
  multiline input.
- Kept the mobile chat composer aligned above the software keyboard when iOS
  pans the visual viewport.
- Kept the original prompt in place during response regeneration, replacing the
  previous answer and showing a dedicated retry state instead of duplicating
  messages.
- Aligned voice-mode responses with the audio delivered to the user, avoiding
  future-tense promises about preparing or sending another voice note.
- Normalized QStash deduplication IDs before publishing queued voice jobs.
- Fixed the production `Minified React error #185` during streamed chat
  rendering by throttling UI updates and removing remaining layout and render
  update loops, including cache invalidation during active chat rendering. See
  [React error #185](https://react.dev/errors/185) for the original error
  reference.
- Moved system messages from conversation history into model instructions so
  summaries remain available without sending unsupported system-role messages
  through the AI SDK.
- Suppressed expected rate-limit and in-progress generation rejections from
  chat error reporting and failure toasts while continuing to report unexpected
  failures.
- Backfilled missing user email addresses from Clerk even when a local profile
  already has a name, and invalidated the cached auth result after syncing.
- Preserved conversation threads during guest migration and waited for guest
  conversion to finish before loading the authenticated chat.
- Added bounded, recoverable authentication requests for signup, verification,
  and resend flows, with localized feedback when security checks fail or stall.
- Added a recovery path for missing OAuth continuation sessions, allowing users
  to restart registration or sign in without submitting against an invalid
  session.
- Calibrated semantic retrieval and corrected RAG usage telemetry so retrieval
  is reported only when matching context chunks are actually included.
- Kept top-center notifications aligned with the active chat column when the
  desktop sidebar is open, while respecting mobile safe-area offsets.
- Narrowed preference-write intent detection so ordinary conversational uses of
  preference language do not create persistent preferences while explicit
  response-style requests continue to work.
- Restored mobile page scrolling by scoping sidebar scroll locking to chat
  routes, cleaning it up when the sidebar closes or navigation leaves chat,
  and allowing the chat launcher to scroll independently on compact viewports.
- Ensured queued voice-processing callbacks use the public Vercel URL when a
  local `APP_URL` is present, so production jobs can reach their queue route.

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
