# Web chat request context

Both browser transports send one user message to `/api/chat` or
`/api/guest/chat`, plus the chat ID, SDK retry identifiers, and device timezone.
The message retains its original ID and attachment references. Loaded history,
assistant messages, feedback, and usage annotations stay in the browser.

The routes still accept older clients that send history. Only the last user
message supplies new content. Owned database messages provide generation
context and the six most recent messages provide title and voice context.
Title refresh cadence therefore does not depend on how many pages were loaded.

The server validates the optional timezone with `Intl` and saves it in inbound
message metadata. Retries reuse the original message and timezone. The stored
message timestamp anchors temporary-memory dates; the device clock does not.
Clients without a timezone remain supported, with ambiguous dates left unsaved.

Checks: `src/lib/chat-client.test.ts`, the web inbound and chat route suites,
and `e2e/chat-memory-ux.spec.ts` cover the payload, retries, attachments, stored
supporting context, and a browser conversation with paginated history.
