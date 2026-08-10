# Mobile Chat Quiet Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Anthon chat surface feel intentional on a 390×844 mobile viewport by removing horizontal clipping, keeping the empty state above the iOS keyboard, calming long assistant responses, reducing technical noise, and giving the composer a compact native-mobile dock.

**Architecture:** Preserve the existing `LayoutClient` visual-viewport sizing and the current chat/message data flow. Implement the redesign inside the existing shell, `MessageList`, `TechnicalMetricsDetails`, `SuggestedActions`, and `ChatInput` components using responsive utility classes and small component-level layout changes; do not add a second mobile renderer or change APIs, persistence, model behavior, or desktop layout semantics.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind CSS v4 utilities, Framer Motion, Vitest Testing Library, Biome.

## Global Constraints

- Keep the existing dark theme and yellow brand accent; yellow is reserved for primary actions and short coaching emphasis, not the entire assistant response surface.
- Preserve the existing `visualViewport` CSS variables and `chat-mobile-viewport` behavior; only tune composition around it.
- Preserve mobile Enter-as-newline, desktop Enter-to-submit, and `Shift+Enter` multiline behavior.
- Keep all interactive targets at least 44px on mobile and keep existing accessible labels.
- Do not mask horizontal overflow as the primary fix; constrain flex children and message content first, then use clipping only as a guard.
- Do not modify the dirty `main` checkout or merge its uncommitted coaching-loop changes into this worktree.
- Verify the selected states at 390×844: empty chat with keyboard, long assistant response, and composer with a multiline draft.

---

### Task 1: Lock the mobile layout contracts with focused tests

**Files:**
- Modify: `src/app/(chat)/components/MessageList.behavior.test.tsx`
- Modify: `src/app/(chat)/components/ChatInput.test.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`
- Test: the same three files with focused Vitest commands.

**Interfaces:**
- Consumes: current `MessageList`, `ChatInput`, and `ChatConversationClient` render contracts.
- Produces: regression coverage for mobile-safe message composition, collapsed technical details, empty-state visibility, and composer height/layout contracts.

- [x] **Step 1: Add a long-message layout regression assertion**

Render a persisted assistant message containing a long unbroken token and normal prose. Assert that the assistant content wrapper and rendered prose expose the mobile-safe `min-w-0`/wrapping contract, while the technical details element remains closed until explicitly opened.

- [x] **Step 2: Add an empty-state visibility assertion**

Render the conversation in its empty idle state and assert that the welcome heading and at least one suggested action are present in the visible mobile composition, rather than relying only on the brain icon.

- [x] **Step 3: Add composer contract assertions**

Render `ChatInput` with an empty draft and a multiline draft. Assert that the explicit send control retains its accessible label, the textarea remains available for native mobile newlines, and the composer exposes the compact mobile class contract.

- [x] **Step 4: Run the focused tests and confirm the new assertions fail before implementation**

Run:

```bash
bunx vitest run \
  'src/app/(chat)/components/MessageList.behavior.test.tsx' \
  'src/app/(chat)/components/ChatInput.test.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

Expected: the existing tests pass and the new layout-contract assertions fail because the new classes/composition are not implemented yet.

---

### Task 2: Recompose the mobile shell and empty state

**Files:**
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/chat/page.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/components/SuggestedActions.tsx` only if the compact mobile suggestion treatment cannot be expressed at the call site.
- Test: `src/app/(chat)/chat/layout-client.test.tsx` and `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`.

**Interfaces:**
- Consumes: `chat-mobile-viewport`, `GuestBanner`, `UsageBanner`, `EmptyChatWelcome`, and `SuggestedActions`.
- Produces: one constrained mobile content column; a compact usage/guest banner; an empty state whose heading and first actions remain above the composer when the viewport shrinks for the keyboard.

- [x] **Step 1: Constrain the shell and top banner**

Add `min-w-0` to the flex shell and main content boundaries where needed. Keep the guest/usage banner as a single compact row with a shrinking text region and a non-shrinking action region; prevent the action from creating a wider layout than the viewport.

- [x] **Step 2: Move the empty-state composition toward the top of the available mobile region**

Replace the mobile `min-h-full justify-center` treatment with a responsive top-anchored layout. Keep desktop centering unchanged. Use a compact icon/title block and place suggested actions beneath it with a bounded vertical gap so the title is not hidden behind the composer or keyboard.

- [x] **Step 3: Make mobile suggestions compact without changing desktop cards**

On mobile, render the coaching starters as compact full-width actions with short labels; retain the existing two-column card treatment from the `sm` breakpoint upward. Do not add new routes or prompt behavior.

- [x] **Step 4: Run the shell and empty-state tests**

Run:

```bash
bunx vitest run \
  'src/app/(chat)/chat/layout-client.test.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

Expected: PASS, with the empty-state heading and suggested action assertions green.

---

### Task 3: Make long responses calm and width-safe

**Files:**
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Modify: `src/app/(chat)/components/TechnicalMetricsDetails.tsx`
- Modify: `src/app/(chat)/components/MessageList.behavior.test.tsx`

**Interfaces:**
- Consumes: current message role/lifecycle rendering, `MemoizedMarkdown`, feedback actions, and technical usage metadata.
- Produces: assistant content that stays inside the mobile column, wraps long content, uses a neutral readable surface, and keeps technical metrics collapsed.

- [x] **Step 1: Make every message row and content column shrinkable**

Add `min-w-0` to the message row and content flex item. Replace the mobile-sensitive fixed percentage constraint with a width bounded by the available column, preserving a narrower user bubble where appropriate. Add safe word wrapping to the prose/content wrapper for long URLs, identifiers, and tokens.

- [x] **Step 2: Rebalance mobile surfaces**

Use a quiet `bg-card`/border treatment for assistant responses. Keep the brand accent on user messages and selected actions. Reduce mobile bubble padding slightly while preserving comfortable line height and the existing desktop spacing.

- [x] **Step 3: Compact the action row on mobile**

Keep accessible 44px icon buttons, but allow the feedback label to wrap or collapse into a short mobile label. Keep copy/regenerate/edit/delete in the existing overflow menu rather than adding visible controls.

- [x] **Step 4: Keep technical details secondary**

Keep `<details>` closed by default and make its summary visually quiet. On narrow screens, metadata should wrap inside the details panel instead of widening the response surface.

- [x] **Step 5: Run message tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx'
```

Expected: PASS, including the long-message wrapping and collapsed-details assertions.

---

### Task 4: Turn the composer into a compact mobile dock

**Files:**
- Modify: `src/app/(chat)/components/ChatInput.tsx`
- Modify: `src/app/(chat)/components/ChatInput.test.tsx`
- Inspect only: `src/app/globals.css` and `src/lib/visual-viewport.ts`; change them only if the component cannot use the existing viewport contract.

**Interfaces:**
- Consumes: current attachment/audio controls, textarea behavior, `safe-area-bottom`, and `chat-mobile-viewport` sizing.
- Produces: a one-line 52–56px mobile composer that expands to at most three lines, stays inside the viewport, and preserves all current submission and keyboard semantics.

- [x] **Step 1: Apply the mobile dock spacing**

Reduce excess mobile bottom padding while retaining the safe-area inset. Add `min-w-0`/`max-w-full` to the form and its control groups, and use a mobile radius and height that read as an input dock rather than a large floating card.

- [x] **Step 2: Keep the send/stop control inside the field**

Reserve a non-shrinking 44px control slot on the right and let the textarea shrink first. Keep the send button disabled state and stop response behavior unchanged.

- [x] **Step 3: Keep attachments and voice secondary on narrow screens**

Preserve their behavior and labels, but prevent them from forcing the textarea below a usable width. If necessary at the narrowest breakpoint, place them behind the existing affordance rather than removing functionality.

- [x] **Step 4: Run composer tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/ChatInput.test.tsx'
```

Expected: PASS, including mobile newline, desktop submit, explicit send, and the new compact-layout assertions.

---

### Task 5: Verify the complete mobile surface

**Files:**
- No new product files; inspect the changed components and generated preview artifacts only.

- [ ] **Step 1: Run scoped Biome checks**

Run:

```bash
bunx biome check \
  'src/app/(chat)/chat/layout-client.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' \
  'src/app/(chat)/components/MessageList.tsx' \
  'src/app/(chat)/components/TechnicalMetricsDetails.tsx' \
  'src/app/(chat)/components/ChatInput.tsx' \
  'src/app/(chat)/components/SuggestedActions.tsx'
```

- [ ] **Step 2: Run the complete relevant unit suite**

Run:

```bash
bunx vitest run \
  'src/app/(chat)/components/MessageList.behavior.test.tsx' \
  'src/app/(chat)/components/ChatInput.test.tsx' \
  'src/app/(chat)/chat/layout-client.test.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

- [ ] **Step 4: Verify the dev preview at 390×844**

Start the dev server from the worktree with the project environment loaded, open `/chat` and a real `/chat/[id]` route, and verify:

1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth` in the empty and long-response states.
2. The empty-state heading and first action remain visible when the textarea is focused and the visual viewport shrinks.
3. A long assistant response wraps without clipping the right edge or action row.
4. The composer keeps the send/stop control fully visible and supports a three-line draft.

- [ ] **Step 5: Commit the verified worktree changes**

Stage only the plan, changed chat UI files, and their focused tests. Use a conventional commit:

```bash
git add docs/superpowers/plans/2026-08-10-mobile-chat-quiet-coach.md \
  'src/app/(chat)/chat/layout-client.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' \
  'src/app/(chat)/components/MessageList.tsx' \
  'src/app/(chat)/components/TechnicalMetricsDetails.tsx' \
  'src/app/(chat)/components/ChatInput.tsx' \
  'src/app/(chat)/components/SuggestedActions.tsx' \
  'src/app/(chat)/components/MessageList.behavior.test.tsx' \
  'src/app/(chat)/components/ChatInput.test.tsx' \
  'src/app/(chat)/chat/layout-client.test.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
git commit -m "feat(chat): refine mobile coaching experience"
```

The main checkout must remain unchanged and its existing uncommitted files must not be staged or merged.
