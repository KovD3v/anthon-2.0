# 001 — Remove route and message entrance latency

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 4 files, small

## Problem

Conversation navigation and message submission are high-frequency actions, but
both replay standard entrance motion.

```tsx
// src/components/ui/page-wrapper.tsx:15 — current
<m.div
  variants={fadeIn}
  initial="hidden"
  animate="show"
  transition={defaultTransition}
>
```

`PageWrapper` wraps both `src/app/(chat)/chat/[id]/page.tsx:67` and its loading
boundary. Each destination therefore fades for 250ms.

```ts
// src/app/(chat)/chat/chat-reactivity-ui.ts:203 — current
if (message.role !== "assistant") {
  return true;
}
```

This makes every user message enter from `translateY(12px)` for 250ms in
`src/app/(chat)/components/MessageList.tsx:720-732`, including Enter-driven
submissions and messages mounted from history.

## Target

- Chat routes render with `initial={false}` and no destination-wide fade.
- User messages mount immediately, just like assistant messages already do.
- Marketing pages may retain the existing `PageWrapper` fade.
- Pending/streaming/persisted assistant reconciliation remains unchanged.

## Repo conventions to follow

- `src/app/(chat)/chat/chat-reactivity-ui.ts:207-210` already documents that
  assistant remounts must not replay entrance motion.
- Use `initial={false}` when a Framer element must remain present without an
  entrance, as in `src/app/(chat)/components/MessageList.tsx:1018-1023`.

## Steps

1. Add a `motion?: boolean` or equivalent explicit opt-out to
   `src/components/ui/page-wrapper.tsx`; when false, set `initial={false}` and
   do not attach entrance variants or transition.
2. Pass the opt-out from `src/app/(chat)/chat/page.tsx`,
   `src/app/(chat)/chat/[id]/page.tsx`, `src/app/(chat)/chat/[id]/loading.tsx`,
   and other chat-route `PageWrapper` call sites. Do not change marketing use.
3. Change `shouldAnimateAssistantMessageMount` to return `false` for user
   messages as well. Rename the helper if needed so its contract remains clear.
4. Update its unit tests and the MessageList behavior test to assert no user or
   assistant entrance replay.

## Boundaries

- Do NOT alter streaming lifecycle, scroll anchoring, timestamps, or actions.
- Do NOT remove landing-page or rare onboarding animation.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `bunx vitest run src/app/\(chat\)/chat/chat-reactivity-ui.test.ts src/app/\(chat\)/components/MessageList.behavior.test.tsx`; `bun run lint`.
- **Feel check**: switch quickly among three existing conversations and send
  five messages with Enter. Selected chats and submitted bubbles must be visible
  immediately, with no whole-page dim-to-bright cycle or vertical drift.
- At 10% playback speed, confirm only genuinely occasional UI retains entrance
  motion.
- **Done when**: chat navigation and user-message mount have no entrance animation.
