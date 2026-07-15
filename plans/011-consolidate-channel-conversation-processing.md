# Plan 011: Extract shared channel-connect lifecycle

> **Executor instructions**: Follow this plan step by step. Preserve provider-visible behavior exactly and migrate one provider at a time. Run every verification command before committing. If a STOP condition occurs, stop and report; do not broaden the abstraction.
>
> **Drift check (run first)**: `git diff --stat d8a446a..HEAD -- src/lib/channel-flow src/lib/channels/telegram/webhook-handler.ts src/lib/channels/whatsapp/webhook-handler.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts`
> If an in-scope file changed or the shared connect/request schema changed, compare this plan with live code and STOP on a semantic mismatch.

## Status

- **Execution status**: DONE on 2026-07-15 — independently reviewed at commit `3962c74` in isolated worktree `/tmp/anthon-plan-011`, branch `improve/011-shared-connect-lifecycle`; 83 focused tests, full `bun run verify` (1,147 passed, 4 skipped), five-file scope audit, and `git diff --check` passed.
- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 013 (`01dc1d6`) and plan 014 (integrated as `d8a446a`)
- **Category**: tech-debt
- **Planned at**: integrated commit `d8a446a`, 2026-07-15
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/37

## Why this matters

The original broad plan is stale: identity resolution, inbound idempotency, thread creation, rate limiting, AI execution, and persistence already live in shared `channel-flow` modules. The remaining high-value duplication is the durable `/connect` lifecycle in both webhook handlers. Extract only that provider-neutral state machine so future fixes cannot drift while tokens, response copy, URLs, logging, and transport stay at the provider edges.

## Current state

- Telegram duplicates request creation, linked-identity detection, token persistence, delivery leasing, and fenced `SENT`/`FAILED` settlement in `src/lib/channels/telegram/webhook-handler.ts` around lines 172–431.
- WhatsApp duplicates the same lifecycle in `src/lib/channels/whatsapp/webhook-handler.ts` around lines 205–467.
- Provider-specific token derivation and token hashing differ and depend on different secrets. Response copy, link paths, send functions, timeout signals, and loggers also differ.
- `ChannelConnectRequest` already supplies the durable status, claim token, lease, attempts, delivered timestamp, and error fields. No schema migration is needed.
- Plan 013's external-inbound lifecycle is separate and must remain untouched. Plan 014's bounded media utilities are already integrated into this worktree and must remain intact.

## Scope

**In scope** (only these files):

- new `src/lib/channel-flow/connect.ts`
- new `src/lib/channel-flow/connect.test.ts`
- `src/lib/channel-flow/index.ts` (exports only)
- `src/lib/channels/telegram/webhook-handler.ts`
- `src/lib/channels/whatsapp/webhook-handler.ts`
- `src/app/api/webhooks/telegram/route.test.ts`
- `src/app/api/webhooks/whatsapp/route.test.ts`

**Out of scope**:

- Prisma schema or migrations
- external-inbound processing, media utilities, AI flow, normal message persistence, rate-limit behavior, or voice behavior
- provider payload parsing, command detection, token/secret derivation, link construction, response copy, send transports, timeouts, or provider logging
- a generic provider adapter or callback-heavy abstraction for the whole webhook handler
- changing delivery retry semantics or attempting provider-side outbound idempotency

## Target boundary

Create a narrow shared service with provider-neutral operations:

1. Create or find a connect request transactionally, detect a non-guest linked identity, persist or refresh a caller-supplied hashed link token, and return `LINK`, `ALREADY_LINKED`, or `UNAVAILABLE`.
2. Atomically claim delivery with a fresh UUID and bounded lease when status is `PENDING`, `FAILED`, or expired `SENDING`.
3. Mark delivery `SENT` or `FAILED` only when request ID, `SENDING` status, and claim token still match; sanitize and bound failure summaries.

The provider edge must derive the raw token and hash before calling the shared service. The shared service may receive only the hash (or `null`), never provider secrets or raw tokens. The edge must still create response text and perform the actual send.

## Steps

### Step 1: Characterize the shared lifecycle

Add `connect.test.ts` with direct unit tests for new request creation, already-linked identity, unavailable token hash, existing/expired token handling, unique-constraint convergence, one-owner delivery claims, expired-lease recovery, and claim-token-fenced `SENT`/`FAILED` settlement. Assert that raw tokens and secrets are not accepted or persisted by the shared API.

**Verify**: `bunx vitest run src/lib/channel-flow/connect.test.ts` exits 0.

### Step 2: Extract provider-neutral connect operations

Move only the database lifecycle into `connect.ts`. Use explicit input/output types and the existing Prisma transaction client. Keep the lease duration as one named shared constant. Preserve the existing ten-minute link-token expiry behavior, including refreshing an expired unconsumed token and leaving consumed tokens unchanged. Preserve the unique-constraint recovery query. Settlement helpers must return whether their fenced update won so callers can distinguish stale ownership if needed.

Export only the narrow public operations from `src/lib/channel-flow/index.ts`. Do not export internal Prisma helpers.

**Verify**: the shared unit test passes and `bun run typecheck` exits 0.

### Step 3: Migrate Telegram without changing its edge

Replace Telegram's local create/find, claim, and settlement helpers with the shared operations. Keep `createTelegramConnectToken`, `hashLinkToken`, Italian copy, `/link/telegram/` URL, `sendTelegramMessage`, timeout, and Telegram-specific logs local. Run Telegram tests before touching WhatsApp and compare behavior for duplicate delivery, already-linked accounts, unavailable secrets, send failure/retry, and concurrent sends.

**Verify**: `bunx vitest run src/lib/channel-flow/connect.test.ts src/app/api/webhooks/telegram/route.test.ts` exits 0.

### Step 4: Migrate WhatsApp and prove parity

Replace the corresponding WhatsApp database lifecycle with the same shared operations. Keep `createWhatsAppConnectToken`, `hashWhatsAppLinkToken`, response copy, `/link/whatsapp/` URL, `sendWhatsAppMessage`, timeout, and WhatsApp-specific logs local. Remove now-unused imports and duplicated helpers only after provider tests pass.

Add or adjust provider-level assertions only where necessary to prove the shared lifecycle is wired symmetrically; do not rewrite unrelated route tests.

**Verify**: `bunx vitest run src/lib/channel-flow/connect.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts` exits 0.

### Step 5: Full gate and scope audit

Run `bun run verify` and `git diff --check`. Inspect `git diff d8a446a...HEAD` and confirm only the seven allowed files changed, apart from this plan/index which the reviewer maintains outside the worktree. Commit with `refactor(channels): share connect lifecycle`.

## Done criteria

- [x] Shared unit tests cover request, token, lease, retry, and stale-owner behavior.
- [x] Both providers use the same database lifecycle implementation.
- [x] Raw tokens, secrets, copy, URLs, transports, timeouts, and loggers remain provider-specific.
- [x] Plan 013 lifecycle and plan 014 media behavior are unchanged.
- [x] No schema migration or broad webhook abstraction is introduced.
- [x] Focused provider tests and `bun run verify` pass.
- [x] `git diff --check` and the allowed-file scope audit pass (five of seven allowed files changed).

## STOP conditions

- Token hashing cannot stay at the provider edge without storing a raw token or secret in shared state.
- Provider payloads, response copy, URLs, send functions, or loggers must leak into the shared service.
- A Prisma schema migration is required.
- A stale claim token can settle a newer delivery lease.
- Existing Telegram or WhatsApp provider behavior must change to make the abstraction fit.
- Verification fails twice after reasonable corrections or an out-of-scope file is required.

## Maintenance notes

This supersedes the original broad Plan 011. Do not revive a generic full-handler adapter without a fresh audit; the existing shared inbound modules already own the appropriate cross-provider behavior.
