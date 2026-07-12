# Plan 007: Add critical persistence integration coverage

> **Executor instructions**: Use a disposable test database and never call live providers.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- vitest.integration.config.ts src/test/integration src/lib/ai/session-cache.ts src/lib/channel-flow src/app/api/chat`

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: tests
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/33

## Why this matters

Only seven route integration suites exist and coverage targets three admin routes. Core chat, channel idempotency, and session-cache persistence are largely mocked.

## Current state

- `vitest.integration.config.ts:7-35` defines DB integration setup but limits coverage inclusion to organization routes.
- `src/lib/ai/session-cache.ts:15-55` persists cached summaries without direct database-backed coverage.

## Scope

**In scope:** integration configuration/setup and new tests for session cache, channel persistence/idempotency, and authenticated chat persistence. **Out of scope:** live OpenRouter, Telegram, WhatsApp, or Clerk calls.

## Steps

1. Reuse the existing `TEST_DATABASE_URL` isolation setup; make fixtures deterministic and cleanup explicit.
2. Add focused characterization tests for summary expiry/upsert, duplicate channel inbound persistence, and chat ownership/persistence.
3. Broaden coverage configuration only after tests are stable.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Integration | `bun run test:integration` | all pass with `TEST_DATABASE_URL` |
| Unit/lint | `bun run verify` | exit 0 |

## Done criteria

- [ ] Tests exercise Prisma against a disposable database.
- [ ] No test uses a live external provider.
- [ ] Integration and verify commands pass in configured CI/local environment.

## STOP conditions

- Stop if no isolated test database is available; report required infrastructure rather than silently weakening tests.

## Maintenance notes

Keep integration suites focused and use unit tests for provider boundary behavior.
