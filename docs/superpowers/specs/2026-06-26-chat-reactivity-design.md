# Chat Reactivity UX Design

## Context

The product feels slow and cumbersome during active chat use. The first improvement should focus on perceived responsiveness in the web chat, without changing model routing, billing, RAG, rate limits, or voice architecture.

The relevant surfaces are:

- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- `src/app/(chat)/components/ChatInput.tsx`
- `src/app/(chat)/components/MessageList.tsx`
- `src/app/(chat)/components/ChatHeader.tsx`
- `src/app/(chat)/components/AudioRecorder.tsx`
- `src/app/(chat)/components/SuggestedActions.tsx`

## Goals

- Make message submission feel immediate and acknowledged.
- Replace generic loading feedback with calm, specific chat states.
- Make the composer feel lighter and more task-focused.
- Remove remaining English copy from the chat interaction surface.
- Keep the implementation low risk and localized to the active chat UI.

## Non-Goals

- Do not change AI model selection, RAG retrieval, or prompt architecture.
- Do not alter billing, trial activation, quota policy, or rate-limit logic.
- Do not redesign the marketing site, admin surfaces, sidebar architecture, or empty `/chat` landing page.
- Do not add synthetic progress percentages or misleading timing claims.

## UX Design

### Immediate Submit Feedback

When the user submits a message, the UI should acknowledge it immediately:

- The composer clears as soon as the send action is accepted by the client.
- The send button switches to the stop control without visual lag.
- The message list shows the user message and assistant pending state together.
- If submission fails, the draft is restored and the user receives an Italian error toast.

This preserves the current `useChat` flow while making the action feel completed from the user's perspective.

### Assistant Waiting State

The assistant should show a compact pending block before and during streaming:

- `submitted`: "Leggo il contesto"
- early `streaming` without visible text: "Sto preparando la risposta"
- active streaming with visible text: no separate fake progress indicator; the streaming text is the feedback

The state should be short, understated, and placed where the next assistant message will appear. It should not claim exact progress.

### Composer Treatment

The composer should keep existing capability but feel lighter:

- Keep attachment, voice, send, and stop controls in stable positions.
- Reduce heavy visual treatment so the input feels like a working tool, not a large decorative element.
- Make disabled and uploading states explicit.
- Keep stable height and spacing across idle, uploading, recording, submitted, and streaming states.
- Use icon buttons with accessible labels for upload, voice, send, and stop.

### Copy Consistency

The active chat UI should use Italian copy consistently. Known strings to update include:

- "Loading older messages..."
- "Load older messages"
- "Less"
- "More"
- "Click to rename"
- "Export"
- "Chat exported successfully"
- "Failed to export chat"
- "Failed to save feedback"
- "Failed to edit message"
- "Failed to regenerate response"
- Upload success and upload failure messages in `ChatInput`

## Component Plan

### `ChatConversationClient`

- Keep the existing submit guard and `useChat` transport.
- Ensure failed send restores the draft and reports an Italian error.
- Pass the current chat status to message rendering so pending assistant feedback can be rendered close to the conversation.

### `MessageList`

- Add a small assistant pending row for `submitted` and for streaming before assistant text is visible.
- Localize older-message loading and action copy.
- Preserve virtualization and lazy loading behavior.

### `ChatInput`

- Keep the same public props unless a small status prop is needed for copy.
- Localize upload toasts.
- Add or verify accessible labels on icon-only controls.
- Refine visual classes without changing attachment or audio behavior.

### `ChatHeader`

- Localize export and rename labels.
- Keep export behavior unchanged.

### `SuggestedActions`

- Localize expand/collapse copy.
- Keep suggestion behavior unchanged.

## Error Handling

- Submission failure restores the text draft and keeps attachments behavior unchanged.
- Upload, edit, feedback, regenerate, and export failures use Italian messages.
- Pending assistant feedback disappears as soon as content streams or the request errors.

## Test Strategy

- Add or update focused tests for chat UI copy and pending-state rendering where existing test structure supports it.
- Run the relevant targeted chat UI tests.
- Run `bun run lint`.
- Run `bun run test`.
- If the development server is available, verify the active chat flow in a browser at `http://localhost:3000`.

## Acceptance Criteria

- Sending a message gives immediate visual acknowledgement.
- While waiting for the assistant, the user sees a specific Italian state instead of a generic or empty pause.
- The composer remains stable and usable across idle, upload, recording, submitted, and streaming states.
- Active chat copy is consistently Italian.
- Existing chat, attachment, voice, edit, regenerate, delete, feedback, lazy-load, and export behavior remains intact.
