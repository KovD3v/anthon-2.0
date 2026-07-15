# Plan 014: Bound external-channel media downloads

> **Executor instructions**: Follow every step and gate. Stop on any STOP condition. Update the plan index when done unless the reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/lib/channels/telegram/utils.ts src/lib/channels/whatsapp/utils.ts src/lib/channels/telegram/utils.test.ts src/lib/channels/whatsapp/utils.test.ts`
> Compare live code with the excerpts below if any path changed; STOP on semantic drift.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

Both external channels currently buffer entire remote media bodies and then base64-encode them. An authenticated sender can therefore drive unbounded memory use, request duration, and downstream transcription/model cost. Enforce explicit byte and time limits before and during download, reject oversize declared provider metadata early, and preserve the existing `null` failure contract.

## Current state

- Telegram types already expose optional `file_size`, but `downloadTelegramAudio`, `downloadTelegramPhoto`, and `downloadTelegramDocument` do not inspect it (`src/lib/channels/telegram/utils.ts:5-31,170-224`).
- Telegram's shared downloader (`:127-153`) does `await res.arrayBuffer()` with no `Content-Length`, streamed-byte, or timeout check.
- WhatsApp (`src/lib/channels/whatsapp/utils.ts:147-172`) fetches metadata and the binary, then calls `arrayBuffer()` without size/time bounds.
- Both utilities return `null` on download failure and log through `createLogger("webhook")`; preserve that caller contract and do not add production `console.log`.
- Route tests mock these utilities, so create focused utility tests rather than relying on webhook tests for byte-stream behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bunx vitest run src/lib/channels/telegram/utils.test.ts src/lib/channels/whatsapp/utils.test.ts` | all pass |
| Channel regression | `bunx vitest run src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts` | all pass |
| Full verification | `bun run verify` | exit 0 |
| Diff hygiene | `git diff --check` | no output, exit 0 |

## Scope

**In scope**:

- `src/lib/channels/telegram/utils.ts`
- `src/lib/channels/whatsapp/utils.ts`
- `src/lib/channels/telegram/utils.test.ts` (create if absent)
- `src/lib/channels/whatsapp/utils.test.ts` (create if absent)

**Out of scope**:

- webhook flow/retry behavior, provider parsing, outbound uploads, AI/transcription limits, attachment persistence, and UI copy
- environment-variable configuration; use reviewed source constants so absent/malformed deployment configuration cannot disable the bound
- logging response bodies or secrets

## Git workflow

- Branch: `advisor/014-bound-channel-media`
- Conventional commit: `fix(channels): bound inbound media downloads`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define reviewed media budgets and a bounded reader

Define named byte limits by media class (image, audio, document) and one short download timeout. Choose values by checking existing accepted product limits and provider behavior; document the rationale beside constants. Implement a private streaming reader that: rejects `Content-Length` above the applicable limit; reads `Response.body` chunks while counting bytes; cancels the reader immediately once the limit is exceeded; aborts via a composed timeout signal; and never allocates the final `Buffer`/base64 string until the raw bytes are within budget. Treat absent or dishonest `Content-Length` as normal and enforce the streamed count.

**Verify**: `bunx vitest run src/lib/channels/telegram/utils.test.ts src/lib/channels/whatsapp/utils.test.ts` -> tests compile and pass.

### Step 2: Apply limits to every Telegram inbound media path

Reject declared `file_size` greater than the matching class limit before calling `getFile`. Pass the applicable limit into the shared downloader for voice/audio, the selected photo, and documents. Ensure timeout/oversize failures log an event name and safe numeric metadata only, then return `null`. Do not include tokenized URLs, auth headers, response bodies, or file content in logs.

**Verify**: `bunx vitest run src/lib/channels/telegram/utils.test.ts` -> cases for declared oversize, `Content-Length` oversize, chunked oversize, exact limit, timeout, and normal download all pass.

### Step 3: Apply the same enforcement to WhatsApp downloads

Keep the metadata request and authenticated binary request, but apply timeout signals to both and the appropriate conservative inbound limit to the binary. If WhatsApp metadata exposes a trustworthy size/type, use it for early rejection; otherwise enforce the streamed limit. Validate that the returned MIME type is a non-empty string and retain `null` on malformed metadata.

**Verify**: `bunx vitest run src/lib/channels/whatsapp/utils.test.ts` -> oversize header, chunked oversize, exact limit, timeout, malformed metadata, and normal download pass.

### Step 4: Run channel and repository regression gates

Do not change handler user-facing behavior: the existing `null` path remains responsible for sending its current failure message.

**Verify**: `bunx vitest run src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts && bun run verify && git diff --check` -> all exit 0.

## Test plan

- Mock `globalThis.fetch` with deterministic `ReadableStream` bodies.
- Prove both header-declared and chunked-body bypass attempts are bounded.
- Prove an exact-limit payload succeeds and limit-plus-one fails without base64 output.
- Use fake timers or an immediately abortable signal for deterministic timeout tests; no real network or sleeps.
- Assert safe failure result/event, never tokenized URL or content.

## Done criteria

- [ ] Every Telegram and WhatsApp inbound media download has a byte limit and timeout.
- [ ] Limits apply when `Content-Length` is absent or false.
- [ ] Telegram declared `file_size` is rejected before network download when oversize.
- [ ] Oversize bodies are cancelled before full buffering/base64 conversion.
- [ ] Existing `null` caller contract remains unchanged.
- [ ] Focused tests, channel tests, `bun run verify`, and `git diff --check` pass.
- [ ] Only in-scope files changed; plan index updated by executor/reviewer.

## STOP conditions

- No defensible existing product/provider size budget can be found; report candidate limits and trade-offs for owner selection.
- Runtime `Response.body` support differs from test/runtime assumptions and needs a dependency or platform-specific implementation.
- Correct handling requires changing webhook response or retry semantics (belongs to plan 013).
- A secret or token would be exposed in a log/test snapshot.
- Verification fails twice or an out-of-scope file is required.

## Maintenance notes

Review raw-byte limits separately from base64 expansion and downstream model limits. When providers add media types, assign a class-specific budget before wiring the downloader. Keep timeout tests deterministic and preserve safe logging.
