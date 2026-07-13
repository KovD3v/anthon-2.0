# Private web voice storage

Generated web voice responses can contain sensitive coaching or personal
information. They are stored in a dedicated **private** Vercel Blob store and
are only streamed after application-level authorization.

## Required setup

1. Create a new Vercel Blob store with **Private** access (for example,
   `anthon-voice-private`). Store access mode cannot be changed after creation.
2. Connect that store to the application and set its read/write token as
   `VOICE_BLOB_READ_WRITE_TOKEN` in every runtime environment.
3. Keep `BLOB_READ_WRITE_TOKEN` assigned to the existing general-upload store.
   The voice code intentionally does not fall back to it.
4. Deploy with `@vercel/blob` 2.3 or newer. Private Blob support is required by
   the SDK; this project currently pins a compatible release through Bun.

If `VOICE_BLOB_READ_WRITE_TOKEN` is absent or points at a non-private store,
new voice creation fails safely. The service must not create a public voice
object as a fallback.

## Storage and delivery path

Both web voice producers use `src/lib/voice/storage.ts`:

- The durable voice worker for voice-first chat (`POST /api/queues/voice`) and
  explicit generation endpoint (`/api/voice/generate`) call
  `putPrivateVoiceBlob()`.
- Uploads use `access: "private"`, a `voice/` pathname, a random suffix, and
  the dedicated `VOICE_BLOB_READ_WRITE_TOKEN`.
- The private provider URL is stored only in server-side `Message.mediaUrl` and
  `Attachment.blobUrl` fields. UI/chat APIs replace audio attachment URLs with
  `/api/voice/messages/:messageId`.
- `/api/voice/messages/[messageId]` checks Clerk authentication and the
  database authorization before it asks Blob for a stream. It validates the
  stored private URL, then resolves only its `voice/` pathname against the
  dedicated store token; it never returns a Blob URL or credential to the
  caller.

The delivery route forwards valid `Range` and `If-None-Match` headers through
the authenticated Blob SDK request. It mirrors `Content-Range` as HTTP `206`,
so browser media controls can seek. Browser responses use
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

## Authorization policy

- A private chat voice response is available only to its owning Anthon user.
- A chat intentionally marked `PUBLIC` may be played by any **authenticated**
  Anthon user. Anonymous requests remain `401`; guest chat APIs do not expose
  attachments.
- A signed-in user without access, an unknown message, or a missing private
  object receives `404`, so the response does not reveal whether another
  user's audio exists.
- Private-store failures produce a generic `502`; logs retain a message ID and
  error class but not provider URLs, signed URLs, or credentials.

## Cleanup and legacy objects

The attachment cleanup job recognizes private `voice/` Blob URLs and deletes
them with `deletePrivateVoiceBlob()`, which uses the dedicated voice token.
It retains the database row when deletion fails so a later cleanup run can
retry; a confirmed missing object is treated as already deleted.

Existing voice objects in the former public Blob store cannot be converted
in-place. They continue to be delivered only through the existing proxy until
the configured attachment-retention job removes them. No automatic copy is
performed, because that would extend the retention of sensitive historical
audio without an explicit operator decision. New objects are private from the
moment of upload.

## Verification

Run the focused tests after changing this boundary:

```bash
bunx vitest run src/lib/voice/storage.test.ts \
  src/app/api/voice/messages/[messageId]/route.test.ts \
  src/app/api/voice/generate/route.test.ts \
  src/app/api/cron/cleanup-attachments/route.test.ts
```

The tests cover private upload options, required credentials, authenticated
owner/public-chat delivery, byte ranges, missing objects, upstream failures,
and private-object cleanup.

For the durable transcript-to-audio lifecycle, retries, and latency fields,
see [Asynchronous web voice generation](./voice-async-generation.md).
