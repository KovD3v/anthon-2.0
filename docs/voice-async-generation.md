# Asynchronous web voice generation

Voice-first web replies persist and stream their text transcript before any
ElevenLabs or Blob work begins. Audio is a durable follow-up to that same
assistant message, never a second assistant response.

## Lifecycle

1. `/api/chat` persists the assistant `Message` with `metadata.voice.status`
   set to `pending` and creates its one-to-one `VoiceGenerationJob` in the
   same database transaction.
2. The request returns the transcript. It asks QStash to deliver
   `POST /api/queues/voice` with the message ID and a deduplication ID of
   `voice-generation:<messageId>`.
3. The worker obtains a short database lease before calling ElevenLabs. QStash
   can redeliver safely: a stale worker cannot attach audio, usage, or status
   after a newer lease owner takes over.
4. After the private Blob upload, one transaction creates the audio
   `Attachment`, sets the job to `READY`, records `VoiceUsage` and daily cost,
   and updates the existing message to audio metadata. All usage accounting is
   keyed to the job, so it is written once.
5. The chat client polls only while a message reports `PENDING` or
   `PROCESSING`. A refresh/reconnect sees the persisted status and eventual
   attachment; it does not need the original stream to remain open.

The UI always keeps the transcript readable. It shows a small audio-preparing
state while the job runs, and a visible text-only notice if the job fails,
expires, or is cancelled.

## Failure, retry, and deletion behavior

- QStash retries transient worker failures. After the configured retry budget,
  the job becomes `FAILED` and the transcript remains available.
- A private object uploaded before a failed persistence or cancelled
  finalization is detached from the unfinished job and deleted best-effort.
  The legacy `/api/voice/generate` endpoint uses the same compensating delete
  after its attachment write fails.
- Message/chat deletion is checked both before TTS and inside finalization.
  A late worker cannot attach to a deleted message. If a worker observes a
  deletion after upload, it deletes the unlinked private object.
- `VoiceGenerationJob.expiresAt` prevents an old pending job from being
  claimed indefinitely. Its default lifetime is 24 hours.

Private Blob setup and authenticated audio delivery are described in
[voice-storage.md](./voice-storage.md).

## Latency measurement

The intended user-facing latency boundary is **time to transcript**, not time
to audio. Before this design, a voice-first request waited for:

```text
LLM transcript + ElevenLabs TTS + Blob upload + attachment/usage writes
```

Now it waits for:

```text
LLM transcript + transcript/job transaction
```

The worker logs `voice.async_generation_ready` with these fields:

- `queueWaitMs`: elapsed time from QStash publication to worker start when
  both timestamps are available.
- `processingTimeMs`: TTS, Blob, and final persistence time owned by the
  worker.
- `transcriptToAudioReadyMs`: elapsed time from persisted job creation until
  the attachment is ready.

For a rollout comparison, collect p50/p95 of the chat request duration for
voice-first turns separately from p50/p95 `transcriptToAudioReadyMs`. Do not
combine them: only the first is blocking for the chat response. No fixed
latency target is documented here because it varies with provider capacity and
queue delay.

## Verification

```bash
bunx vitest run src/lib/voice/generation-jobs.test.ts \
  src/app/api/queues/voice/route.test.ts \
  src/app/api/chat/route.test.ts \
  src/app/api/voice/generate/route.test.ts
```

The focused tests cover deduplicated publication, concurrent delivery,
attachment/accounting exactly once, cancelled finalization cleanup, deletion
races, queue retry signaling, and legacy endpoint cleanup.
