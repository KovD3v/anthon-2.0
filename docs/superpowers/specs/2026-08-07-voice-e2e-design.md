# Deterministic authenticated voice E2E coverage

## Status

Approved scope, pending review of this written specification before implementation.

## Problem

The existing Playwright gate verifies the guest chat in desktop and mobile
Chromium, but guests are not eligible for voice responses. The durable voice
path therefore has no browser-level regression that proves an authenticated
turn progresses from transcript persistence to completed audio delivery.

Unit and integration tests cover individual voice decisions, jobs, storage,
and media routes. They do not prove that those pieces remain connected through
the real chat UI, its bounded polling loop, the persisted database state, and
the authorized audio player.

## Goals

- Exercise an explicitly requested voice response as an authenticated user.
- Keep the default E2E gate deterministic, isolated, and free of provider cost.
- Use the existing expiring Neon branch and real Next.js application.
- Verify both successful and failed asynchronous voice generation.
- Prove that the transcript remains usable throughout generation and failure.
- Verify the authorized media response and browser player after completion.

## Non-goals

- Call the live ElevenLabs or Vercel Blob services.
- Exercise production QStash delivery from a localhost callback. Queue
  publishing and deduplication remain contract-tested below the browser layer;
  development runs the same persisted worker in-process.
- Test microphone capture, browser permission prompts, or speech-to-text.
- Turn the E2E authentication fixture into a general development login bypass.
- Change production voice eligibility, cadence, retry, or retention behavior.

## Design

### 1. E2E-only authenticated identity

Add a narrowly guarded authentication fixture for the Playwright process. The
runner creates a random per-run secret and enables the fixture only when all of
these conditions hold:

- `NODE_ENV` is `development`;
- `E2E_EPHEMERAL_BRANCH_ID` identifies the isolated Neon child branch; and
- the request carries a correctly signed, HTTP-only E2E session cookie.

Global setup seeds one non-guest user and an active voice-eligible subscription
in that branch. Shared server authentication resolves the signed fixture before
falling back to Clerk. The authenticated chat handler and voice-media route use
that shared boundary, avoiding duplicated test-only checks.

The fixture must fail closed when any guard or signature is absent. Production
and normal local development continue to use Clerk exclusively.

### 2. Local voice provider and object store

Extend the local E2E provider process with two deterministic boundaries:

- an ElevenLabs-compatible endpoint that returns a small valid MP3 fixture or
  a controlled error; and
- a run-local object store that accepts generated audio and serves it back with
  content type, length, ETag, and byte-range behavior.

Provider base URLs are configurable only on the server and retain their current
production defaults. The local object-store adapter is accepted only under the
same E2E branch guard used by authentication. No test credential or mock URL is
available in a production build.

The runner starts the provider alongside the existing OpenRouter mock and
supplies dummy provider credentials plus the guarded local endpoints.

### 3. Successful voice scenario

The browser opens an authenticated chat and sends an explicit request such as
`Rispondimi con un vocale`. The deterministic request-intent policy selects
voice without relying on the suitability classifier.

The test verifies this sequence:

1. The assistant transcript is rendered once.
2. The UI exposes `Sto preparando l'audio...` while the persisted job is
   unresolved.
3. Polling refreshes the existing message rather than creating a duplicate.
4. The completed attachment replaces the pending state with the audio player.
5. The media endpoint returns `200`, `audio/mpeg`, and `private, no-store`.
6. Browser playback changes the accessible control from play to pause.
7. The transcript can be opened and remains present after a page reload.
8. The database contains one ready job, one audio attachment, and one voice
   usage record linked to the same assistant message.

The mock introduces a short deterministic delay so the pending state is
observable without making the test timing-sensitive.

### 4. Failed voice scenario

A request marker instructs the local provider to return a retryable failure for
all bounded attempts. The test verifies that:

1. the transcript appears and remains readable;
2. the job reaches `FAILED` after the normal local retry sequence;
3. the UI replaces the pending indicator with the existing unavailable-audio
   fallback;
4. no player or attachment is exposed; and
5. chat-data polling stops once the terminal state is observed.

The assertion uses request counting around the chat refresh endpoint rather
than sleeping for the full polling ceiling.

### 5. Test organization and isolation

Add `e2e/voice-chat.spec.ts` and shared helpers for opening the authenticated
fixture. Keep guest scenarios unchanged. Voice tests run in desktop and mobile
Chromium through the existing Playwright projects unless a browser capability
requires a narrowly documented skip.

Each test creates distinct user/chat data or cleans its own seeded records so
provider failure state and voice cadence cannot leak between scenarios. The
ephemeral branch remains the final isolation and cleanup boundary.

Focused unit tests cover the new authentication guard, signature validation,
provider URL configuration, and E2E environment construction. Playwright specs
remain excluded from Vitest discovery.

## Acceptance criteria

- `bun run test:e2e -- e2e/voice-chat.spec.ts` passes without live Clerk,
  ElevenLabs, Vercel Blob, or QStash calls.
- The successful test observes pending, ready, playback, transcript, reload,
  media headers, and persisted database evidence.
- The failure test observes pending, terminal fallback, retained transcript,
  no attachment, and bounded polling.
- The existing guest E2E suite continues to pass.
- E2E authentication and local storage are impossible to activate without an
  expiring E2E Neon branch and the per-run secret.
- Relevant unit tests, Biome checks, TypeScript checks, and `git diff --check`
  pass before completion.
