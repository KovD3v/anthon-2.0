# Temporary contextual memory

ADR-0019 permits useful future events, deadlines, pressures and temporary plans to remain in memory until a grounded expiry or review date. ADR-0028 applies the same rule to referenced people, with their name or relationship preserved. Short-lived chatter remains transient and is not saved.

Extraction marks these facts `TEMPORARY` and copies the user's complete date expression into `expiry.expression`. Live memory tools accept the same validated object. The server resolves it and writes the existing `Memory.expiresAt`; the model never supplies a calculated expiry. A durable replacement explicitly supplies `null` to clear expiry. An omitted expiry in a revision preserves it.

Dates use the original persisted inbound message's `createdAt`, including delayed processing and history backfills. A source timezone explicitly written by the user takes precedence over `Message.metadata.timeZone`, followed by an active, explicitly supplied `user_timezone` or `timezone` fact. Web requests can supply the device's validated IANA timezone as message metadata. This is a message-local interpretation aid, not a location or profile inference. Other channels need an explicit or known timezone for local dates.

Supported forms are ISO calendar dates, Italian or English month names with a year, today/tomorrow/the day after tomorrow, a numeric number of days from the source message, and an upcoming weekday. Italian equivalents are supported. A bare weekday or "this Friday" means its next occurrence, including the source day. A date without a clock time remains active until the following local midnight. A supplied clock time expires at that instant; offset-bearing ISO timestamps need no timezone lookup. Daylight-saving transitions use local calendar boundaries. Nonexistent or repeated local clock times are rejected.

Ambiguous dates such as "next Friday", "venerdì prossimo", a date without a year, numeric regional dates, missing timezone, invalid dates and already elapsed deadlines are skipped during extraction. Live tools return `clarification_required`. They do not guess a timezone, add a default lifetime or turn expired events into future ones. Facts whose type and expiry disagree are rejected.

Sensitive facts still require the existing immediate, attributed confirmation. Their original observation time and resolved expiry travel in the approval's JSON value. The approval deadline is the earlier of its existing 15-minute limit and the fact's expiry. Legacy string approvals remain readable. Confirmation cannot extend the event's lifetime.

Fact recall filters expired entries on every cached read. Full and compact memory prompts stop caching at the earliest fact expiry; the compact SQL query also excludes deleted and expired rows. Temporary prompt entries include their original observation time and expiry so a later turn does not reinterpret "tomorrow" against a different day. Scheduled durable-memory consolidation excludes temporary facts. Expiry removes a fact from active coaching context; it does not erase the original conversation or turn an event into durable evidence about its outcome.

Regression commands:

```bash
bunx vitest run src/lib/ai/memory-expiry.test.ts src/lib/ai/memory-extractor.test.ts src/lib/ai/memory-consolidator.test.ts src/lib/ai/memory-facts.test.ts src/lib/ai/memory-approval.test.ts src/lib/ai/tools/memory.test.ts src/lib/ai/tools/user-context.test.ts src/lib/maintenance/memory-consolidation.test.ts src/lib/ai/recall-context.test.ts
bun run test:integration src/lib/ai/memory-expiry.integration.test.ts
bun run lint
bun run typecheck
```

Unit tests use synthetic records, fake clocks and provider/database boundary mocks. The integration case exercises production save, recall, prompt caches and revisions against an isolated PostgreSQL branch. Neither measures live extraction accuracy or generated-answer quality.
