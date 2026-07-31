# Changelog

All notable changes to Anthon 2.0 are documented here.

## [Unreleased] - 2026-08-01

The July reliability audit is implemented on the isolated
`improve/037-all-audit-findings` branch. See [Plan 037](plans/037-close-july-audit-findings.md)
for the complete scope and verification record.

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

### Security

- Admin-gated the legacy global RAG API.
- Applied Clerk security patches and preserved fail-closed authorization and
  ownership checks across attachments, chat, uploads, and channel flows.
- Added bounded guest abuse controls using separate token hashing and abuse
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

Product-direction proposals DIR-01 through DIR-04 and corpus-dependent Plans
016-018 remain intentionally outside this implementation batch.
