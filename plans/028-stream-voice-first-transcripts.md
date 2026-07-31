# Plan 028: Stream voice-first transcripts before generation completes

> **Executor instructions**: Follow each step and verification gate. Preserve
> exactly-once assistant persistence and durable voice-job behavior. Stop on any
> STOP condition rather than creating a second assistant message or weakening
> failure handling. The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 56c0a0a..HEAD -- src/lib/channels/web/chat-route-handler.ts src/lib/channel-flow/run.ts src/lib/channel-flow/types.ts src/app/api/chat/route.test.ts src/lib/channel-flow/run.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/027-add-authenticated-chat-performance-gate.md`
- **Category**: perf
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

Voice-first web turns currently consume the complete LLM stream, persist the
assistant transcript, and only then return a synthetic one-delta stream. The
user therefore sees no assistant content until full model generation and
database persistence finish. TTS is already asynchronous, so withholding the
transcript provides no corresponding audio-readiness benefit.

The target is to return the real transcript stream immediately while preserving
one canonical persisted assistant message, one durable voice-generation job,
the existing metadata contract, and retry-safe background TTS scheduling.

## Current state

- `src/lib/channels/web/chat-route-handler.ts:481-506` awaits
  `handleVoiceFirstWebResponse` when voice mode is selected.
- `src/lib/channels/web/chat-route-handler.ts:868-904` calls
  `runChannelFlow` with `execution.mode = "text"` and disables shared
  persistence.
- `src/lib/channel-flow/run.ts:175-178` drains the entire model text stream in
  text mode.
- `src/lib/channels/web/chat-route-handler.ts:911-935` then creates the
  assistant message and pending voice-generation job.
- `src/lib/channels/web/chat-route-handler.ts:937-942` schedules TTS and returns
  the completed transcript as a single delta.
- `src/lib/channel-flow/run.ts:144-172` already returns a streaming response in
  stream mode, but its persistence policy does not expose an after-save hook or
  voice-generation creation options.
- `src/lib/channel-flow/persistence.ts` is the single assistant-persistence
  service. Continue using it; do not reimplement its usage, trace, memory, or
  tag behavior.
- `src/app/api/chat/route.test.ts:1050` is the voice-first route-test pattern.
- `src/lib/channel-flow/run.test.ts` is the shared stream/persistence pattern.

## Required invariants

1. The HTTP response is returned after orchestration setup, before the full LLM
   text stream is consumed.
2. Exactly one assistant `Message` is persisted.
3. Exactly one durable voice-generation job is created for that message.
4. TTS scheduling occurs only after assistant persistence succeeds.
5. Stream failure cannot leave a job eligible to synthesize an empty transcript.
6. The persisted metadata retains `responseMode: "voice"`, transcript,
   voice-decision fields, and pending/failed generation status.
7. Reload/reconnect still resolves to the same canonical persisted assistant
   message and eventual audio attachment.
8. Text-mode and external-channel flows are unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Channel tests | `bunx vitest run src/lib/channel-flow/run.test.ts` | all pass |
| Chat route tests | `bunx vitest run src/app/api/chat/route.test.ts` | all pass |
| Auth performance | command from plan 027 | voice-first first-chunk latency is lower than the captured baseline without a total-time regression outside tolerance |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/channels/web/chat-route-handler.ts`
- `src/lib/channel-flow/run.ts`
- `src/lib/channel-flow/types.ts`
- `src/lib/channel-flow/run.test.ts`
- `src/app/api/chat/route.test.ts`

**Out of scope**:

- Voice suitability policy, classifier model, timeout, or quota.
- ElevenLabs/provider choice and audio encoding.
- Database schema or migration changes.
- Guest, Telegram, or WhatsApp delivery behavior.
- Changing model routing or output-length policy.
- Creating a placeholder assistant row before model output starts.

## Git workflow

- Branch: `improve/028-stream-voice-first`
- Commit: `perf(chat): stream voice-first transcripts`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Extend shared persistence with an after-save contract

In `src/lib/channel-flow/types.ts`, add the minimum optional persistence fields
needed by voice-first web delivery:

- the existing `persistAssistantOutput` voice-generation creation options;
- an `afterSave` callback receiving the canonical saved message ID.

Thread these through `src/lib/channel-flow/run.ts`. Invoke `afterSave` only
after `persistAssistantOutput` succeeds. If it fails, keep the existing
`persistence = {status: "failed"}` behavior and do not call `afterSave`.

Do not add channel-specific voice imports to the generic flow module; the
callback owned by the web handler schedules the voice job.

**Verify**:
`bunx vitest run src/lib/channel-flow/run.test.ts` → tests prove after-save runs
once after success, never before persistence, and never on failure.

### Step 2: Move voice-first web delivery onto stream mode

Replace the current drain-then-`createTextStreamResponse` path in
`handleVoiceFirstWebResponse` with `runChannelFlow` stream mode:

- enable shared assistant persistence;
- pass the existing voice metadata and pending status;
- pass `voiceGeneration: { expiresAt }`;
- pass `waitUntil` and existing revalidation tags;
- schedule `scheduleVoiceGenerationJob(messageId, schedule)` from `afterSave`;
- return `flowResult.streamResult.toUIMessageStreamResponse()` immediately.

The stream-mode setup must not iterate `textStream` or await `onFinish` before
returning the response. Remove `createTextStreamResponse` only if no caller
remains.

**Verify**:
`bunx vitest run src/app/api/chat/route.test.ts` → the voice-first response is
created before deferred stream completion.

### Step 3: Preserve failure and reload behavior

Add route tests using a controllable deferred text stream:

- response construction resolves while the model stream remains open;
- deltas are forwarded incrementally, not collapsed into one delta;
- completion persists one transcript and creates one pending job;
- failed persistence schedules no TTS;
- failed generation persists/schedules nothing that can synthesize empty text;
- existing explicit and automatic voice metadata is unchanged;
- text-mode behavior remains streaming and unchanged.

If the AI SDK requires message metadata for the client to recognize a pending
voice job, extend the existing stream metadata callback with only the persisted
voice status fields. Do not create a second client-only assistant record.

**Verify**:
the two focused test commands pass.

### Step 4: Compare authenticated latency

Run the exact same voice-eligible prompt set and environment captured by plan
027. Compare p50/p95 first-chunk and total duration. First-chunk must occur
before full generation completes in the controlled deferred-stream test, and
the live p95 must materially improve relative to baseline.

If the safe live fixture is unavailable, keep the plan BLOCKED after unit/full
verification rather than claiming a measured performance improvement.

**Verify**:
plan-027 authenticated command exits 0 and the executor report contains
aggregate before/after values only.

### Step 5: Run full gates

**Verify**:
`bun run verify && git diff --check` → exit 0.

## Test plan

Use `src/app/api/chat/route.test.ts:1050` and
`src/lib/channel-flow/run.test.ts` as patterns. Cover the eight required
invariants, especially deferred streaming, exactly-once persistence/job
creation, failure paths, and text-flow non-regression.

## Done criteria

- [ ] Voice-first HTTP response construction does not wait for full model output.
- [ ] Multiple model deltas reach the client incrementally.
- [ ] Exactly one assistant message and one voice job are created.
- [ ] TTS scheduling happens only after successful persistence.
- [ ] Failure paths cannot synthesize empty or duplicate transcripts.
- [ ] Focused tests and `bun run verify` pass.
- [ ] Safe authenticated before/after evidence shows improved first-chunk p95;
      otherwise the plan remains BLOCKED.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- Streaming requires a placeholder database message or schema migration.
- The AI SDK cannot preserve one canonical assistant identity across stream and
  reload without changing public client contracts.
- A failure path can create duplicate assistant messages or voice jobs.
- The change alters voice eligibility, quotas, or external channels.
- Plan 027 has no safe authenticated baseline.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Keep transcript streaming and audio readiness as separate timings. Future voice
changes should preserve the order: stream text, persist canonical output,
create/schedule durable audio work, then attach audio to the same message.
