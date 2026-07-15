# Plan 013: Make external-channel inbound processing retryable

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise. When done, update this plan's row in `plans/README.md` unless the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- prisma/schema.prisma prisma/migrations src/lib/channel-flow/external-inbound.ts src/lib/channel-flow/external-inbound.test.ts src/lib/channel-flow/index.ts src/lib/channels/telegram/webhook-handler.ts src/lib/channels/whatsapp/webhook-handler.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts`
> If an in-scope file changed, compare the excerpts below with live code. On a semantic mismatch, STOP.

## Status

- **Execution status**: DONE on 2026-07-15 — independently reviewed at commit `01dc1d6` on branch `improve/013-retryable-inbound`; schema validation, client generation, 89 focused tests, full `bun run verify` (1,124 passed, 4 skipped), scope audit, and `git diff --check` passed.
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none; `plans/011-consolidate-channel-conversation-processing.md` must wait for this plan
- **Category**: bug
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

Telegram and WhatsApp persist their unique inbound `Message` before downloading media, transcribing, invoking AI, or sending a reply. Any transient failure after persistence leaves the message permanently classified as a duplicate on provider retry, so the user's request can be lost. Add a durable, lease-based processing lifecycle so one worker owns processing, completed work stays idempotent, and failed or abandoned work can be reclaimed safely.

This plan does not change `/connect`: plan 004 already owns its separate `ChannelConnectRequest` delivery lifecycle. Plan 011's provider consolidation must follow this plan so it consolidates the corrected lifecycle rather than preserving the bug.

## Current state

- `src/lib/channel-flow/external-inbound.ts:170-212` treats any existing row as terminal and persists the marker before downstream work:

```ts
const existing = await prisma.message.findFirst({
  where: { channel: envelope.channel, externalMessageId: envelope.externalMessageId },
  select: { id: true },
});
if (existing) return { status: "duplicate" };
// ...
const inbound = await prisma.message.create({ /* unique marker */ });
```

- `src/lib/channels/telegram/webhook-handler.ts:475-521` and `src/lib/channels/whatsapp/webhook-handler.ts:523-566` return immediately for `status === "duplicate"`, then perform rate-limit, configuration, media, transcription, AI, persistence, and outbound-send work after the claim.
- `prisma/schema.prisma:393-424` has `Message.externalMessageId` and `@@unique([channel, externalMessageId])`, but no processing status, lease, attempt count, or terminal timestamp.
- `prisma/schema.prisma:287-320` provides the local lifecycle exemplar: `ChannelConnectRequest` uses `PENDING/SENDING/SENT/FAILED`, a claim token, lease expiry, attempt count, delivered timestamp, and last error. Match this vocabulary and atomic-claim approach, but do not reuse that model or alter connect behavior.
- `src/lib/channel-flow/external-inbound.test.ts` is the unit-test pattern for identity races and duplicate claims. Webhook route tests under `src/app/api/webhooks/{telegram,whatsapp}/route.test.ts` are the provider-level patterns.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Prisma validation | `bunx prisma validate` | exit 0 |
| Prisma client | `bunx prisma generate` | exit 0 |
| Focused tests | `bunx vitest run src/lib/channel-flow/external-inbound.test.ts src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts` | all pass |
| Full verification | `bun run verify` | exit 0 |
| Diff hygiene | `git diff --check` | no output, exit 0 |

## Scope

**In scope** (only these files):

- `prisma/schema.prisma`
- one new migration under `prisma/migrations/`
- `src/lib/channel-flow/external-inbound.ts`
- `src/lib/channel-flow/external-inbound.test.ts`
- `src/lib/channel-flow/index.ts` (exports only; no unrelated channel-flow refactor)
- `src/lib/channels/telegram/webhook-handler.ts`
- `src/lib/channels/whatsapp/webhook-handler.ts`
- `src/app/api/webhooks/telegram/route.test.ts`
- `src/app/api/webhooks/whatsapp/route.test.ts`

**Out of scope**:

- `/connect` and `ChannelConnectRequest` (plan 004)
- provider payload parsing, media limits, rate-limit policy, AI prompts/models, and outbound transport semantics
- channel-flow consolidation or large handler refactors (plan 011)
- retrying an outbound reply after the provider accepted it but the acknowledgement was lost; without provider idempotency that can duplicate replies

## Git workflow

- Branch: `advisor/013-retryable-external-inbound`
- Use conventional commits; final logical commit: `fix(channels): make inbound processing retryable`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add an external-inbound lifecycle to `Message`

Add a channel-inbound processing enum and nullable lifecycle fields that are populated only for external inbound messages: status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), opaque claim token, lease expiry, attempt count, completion timestamp, and bounded/sanitized last-error summary. Add an index supporting reclaim queries by status and lease expiry. Create a migration with `bunx prisma migrate dev --name add_external_inbound_processing_lifecycle`; inspect SQL to ensure existing rows remain valid and no unrelated schema change is included. Existing rows with an external ID should retain terminal duplicate behavior through an explicit compatibility rule (do not silently replay historical messages).

**Verify**: `bunx prisma validate && bunx prisma generate` -> both exit 0.

### Step 2: Replace terminal duplicate detection with an atomic lease claim

In `external-inbound.ts`, return three explicit outcomes: accepted with a claim token, already completed/in-flight duplicate, or reclaimed retry. Use a short named lease constant and atomic conditional updates (`updateMany` with status/lease predicates), not read-then-write ownership. A new row starts owned by the current token; a failed row or expired `PROCESSING` lease is reclaimable; an unexpired lease and `COMPLETED` row are duplicates. Concurrent workers must yield exactly one owner. Increment attempts only on successful claims.

Export narrow helpers that require both inbound ID and claim token to mark `COMPLETED` or `FAILED`; stale owners must not overwrite a newer owner. Store only a bounded `safeErrorSummary`, never payloads, tokens, or stack traces. Preserve identity/thread/rate-limit/funnel behavior and the unique-constraint race.

**Verify**: `bunx vitest run src/lib/channel-flow/external-inbound.test.ts` -> all tests pass, including concurrent claim, active lease, expired lease, failed retry, completion, and stale-token cases.

### Step 3: Close the lifecycle in both provider handlers

Wrap only the post-claim processing portion of each handler. Mark processing `COMPLETED` after intentional terminal outcomes (including rate-limit response and explicitly disabled AI). Mark it `FAILED` before returning on retryable failures such as media download, transcription, AI generation/persistence, or outbound-send failure; unexpected throws must also release the claim as failed and then follow the handler's existing error response/logging behavior. Do not mark complete before the last required side effect. Pass claim ownership explicitly rather than relying on mutable global state.

Because outbound providers may accept a send whose acknowledgement is lost, do not invent automatic resend guarantees. Document that boundary in a concise code comment at the completion call.

**Verify**: `bunx vitest run src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts` -> all tests pass.

### Step 4: Add regression coverage and run the full gate

Add provider-level tests proving: first processing fails after persistence; the same provider message is accepted again; successful retry completes; a third delivery is ignored; concurrent delivery with a live lease does not invoke AI twice. Keep Telegram and WhatsApp expectations symmetric where behavior is shared.

**Verify**: `bun run verify && git diff --check` -> exit 0 and no whitespace errors.

## Test plan

- Extend `external-inbound.test.ts` with lifecycle state-machine and atomic ownership cases.
- Extend both provider route tests with one transient failure/retry/completion scenario and one completed duplicate scenario.
- Preserve existing identity-race and funnel tests.
- Run the focused command, then `bun run verify`.

## Done criteria

- [x] A persisted inbound row is not automatically a terminal duplicate.
- [x] Failed and lease-expired processing is reclaimable; active and completed processing is not.
- [x] Claim-token predicates prevent stale workers changing current state.
- [x] Telegram and WhatsApp explicitly complete or fail every accepted claim.
- [x] Historical rows are not replayed by migration.
- [x] Focused tests and `bun run verify` pass.
- [x] `git diff --check` passes and only in-scope files changed.
- [x] `plans/README.md` status updated by the executor/reviewer.

## STOP conditions

- Existing migration history or production data makes a non-replaying backfill ambiguous.
- Atomic lease claiming cannot be expressed without raw SQL whose locking behavior is untested.
- Correct retry requires changing provider acknowledgement behavior or risks known duplicate outbound messages.
- An in-scope handler has materially diverged from the excerpts.
- Verification fails twice after a reasonable correction, or an out-of-scope file is required.

## Maintenance notes

Review claim predicates and terminal paths as a state machine; one missed return can strand work. Future handlers must use the same claim/complete/fail contract. Execute plan 011 only after this behavior is merged and characterized.
