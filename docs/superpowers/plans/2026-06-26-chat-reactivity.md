# Chat Reactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active web chat feel more responsive by adding immediate, Italian pending feedback, a lighter composer, and consistent Italian microcopy.

**Architecture:** Keep the existing `useChat` transport and component boundaries. Add a small pure UI helper for pending-state labels and source-level test anchors, then wire the helper into `ChatConversationClient`, `MessageList`, `ChatInput`, `ChatHeader`, `SuggestedActions`, and `AudioRecorder` without changing backend, billing, RAG, or voice behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, AI SDK `useChat`, Vitest, Biome, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-06-26-chat-reactivity-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| CREATE | `src/app/(chat)/chat/chat-reactivity-ui.ts` | Pure helpers/constants for chat pending labels and Italian UX copy. |
| CREATE | `src/app/(chat)/chat/chat-reactivity-ui.test.ts` | Unit tests for pending-label and draft-restore copy behavior. |
| MODIFY | `src/app/(chat)/chat/[id]/chat-conversation-client.tsx` | Restore failed drafts, localize edit/regenerate errors, pass status to message list. |
| MODIFY | `src/app/(chat)/components/MessageList.tsx` | Render assistant pending row and localize lazy-load/feedback copy. |
| MODIFY | `src/app/(chat)/components/ChatInput.tsx` | Lighten composer, localize upload copy, add accessible labels, keep stable states. |
| MODIFY | `src/app/(chat)/components/ChatHeader.tsx` | Localize export and rename copy. |
| MODIFY | `src/app/(chat)/components/SuggestedActions.tsx` | Localize expand/collapse copy. |
| MODIFY | `src/app/(chat)/components/AudioRecorder.tsx` | Add accessible label to icon-only voice control. |
| MODIFY | `src/app/(chat)/chat/layout.test.tsx` | Add source-level regression checks for Italian copy, pending labels, and composer a11y anchors. |

---

## Task 1: Add Pure Chat Reactivity Helpers

**Files:**
- Create: `src/app/(chat)/chat/chat-reactivity-ui.ts`
- Create: `src/app/(chat)/chat/chat-reactivity-ui.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/app/(chat)/chat/chat-reactivity-ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CHAT_REACTIVITY_COPY,
  getAssistantPendingLabel,
} from "./chat-reactivity-ui";

describe("getAssistantPendingLabel", () => {
  it("shows context-reading feedback while a request is submitted", () => {
    expect(
      getAssistantPendingLabel({
        status: "submitted",
        hasVisibleAssistantText: false,
      }),
    ).toBe("Leggo il contesto");
  });

  it("shows preparation feedback while streaming before text appears", () => {
    expect(
      getAssistantPendingLabel({
        status: "streaming",
        hasVisibleAssistantText: false,
      }),
    ).toBe("Sto preparando la risposta");
  });

  it("hides pending feedback once assistant text is visible", () => {
    expect(
      getAssistantPendingLabel({
        status: "streaming",
        hasVisibleAssistantText: true,
      }),
    ).toBeNull();
  });

  it("does not show pending feedback while idle or errored", () => {
    expect(
      getAssistantPendingLabel({
        status: "ready",
        hasVisibleAssistantText: false,
      }),
    ).toBeNull();
    expect(
      getAssistantPendingLabel({
        status: "error",
        hasVisibleAssistantText: false,
      }),
    ).toBeNull();
  });
});

describe("CHAT_REACTIVITY_COPY", () => {
  it("provides Italian failure copy for draft restoration", () => {
    expect(CHAT_REACTIVITY_COPY.submitFailed).toBe("Invio messaggio fallito");
  });
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/chat-reactivity-ui.test.ts'
```

Expected: FAIL because `src/app/(chat)/chat/chat-reactivity-ui.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/app/(chat)/chat/chat-reactivity-ui.ts`:

```ts
export type ChatRequestStatus = "submitted" | "streaming" | "ready" | "error";

export const CHAT_REACTIVITY_COPY = {
  submitFailed: "Invio messaggio fallito",
  olderMessagesLoading: "Carico i messaggi precedenti...",
  loadOlderMessages: "Carica messaggi precedenti",
  feedbackFailed: "Impossibile salvare il feedback",
  editFailed: "Modifica del messaggio fallita",
  regenerateFailed: "Rigenerazione della risposta fallita",
  uploadSuccess: "File caricato",
  uploadFailed: "Caricamento file fallito",
  uploadTooLarge: "File troppo grande. Dimensione massima: 10 MB.",
  exportLabel: "Esporta",
  exportSuccess: "Chat esportata",
  exportFailed: "Esportazione chat fallita",
  renameTitle: "Rinomina chat",
  showMore: "Mostra altro",
  showLess: "Mostra meno",
} as const;

export function getAssistantPendingLabel({
  status,
  hasVisibleAssistantText,
}: {
  status: ChatRequestStatus;
  hasVisibleAssistantText: boolean;
}): string | null {
  if (status === "submitted") {
    return "Leggo il contesto";
  }

  if (status === "streaming" && !hasVisibleAssistantText) {
    return "Sto preparando la risposta";
  }

  return null;
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/chat-reactivity-ui.test.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add 'src/app/(chat)/chat/chat-reactivity-ui.ts' 'src/app/(chat)/chat/chat-reactivity-ui.test.ts'
git commit -m "feat: add chat reactivity ui helpers"
```

Expected: commit succeeds with only the helper and helper test.

---

## Task 2: Render Assistant Pending Feedback

**Files:**
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/chat/layout.test.tsx`

- [ ] **Step 1: Add source-level regression checks**

In `src/app/(chat)/chat/layout.test.tsx`, add this test inside `describe("chat mobile viewport layout", () => { ... })`:

```ts
  it("renders specific Italian assistant pending states during active chat waits", () => {
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );
    const helper = readFileSync(
      "src/app/(chat)/chat/chat-reactivity-ui.ts",
      "utf8",
    );

    expect(helper).toContain('"Leggo il contesto"');
    expect(helper).toContain('"Sto preparando la risposta"');
    expect(conversationClient).toContain("status={status}");
    expect(messageList).toContain("getAssistantPendingLabel");
    expect(messageList).toContain("assistantPendingLabel");
  });
```

- [ ] **Step 2: Run the targeted layout test and verify it fails**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: FAIL because `status={status}` and pending-label wiring are not present.

- [ ] **Step 3: Update `MessageList` props and imports**

In `src/app/(chat)/components/MessageList.tsx`, add the helper import after existing imports:

```ts
import {
  CHAT_REACTIVITY_COPY,
  type ChatRequestStatus,
  getAssistantPendingLabel,
} from "../chat/chat-reactivity-ui";
```

Add the new prop to `MessageListProps`:

```ts
  status: ChatRequestStatus;
```

Add `status` to the destructured props:

```ts
  status,
```

- [ ] **Step 4: Add visible assistant text detection**

In `MessageList`, after `const [feedbackState, setFeedbackState] = useState<Record<string, number>>({});`, add:

```ts
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const hasVisibleAssistantText = lastAssistantMessage
    ? getMessageText(lastAssistantMessage).trim().length > 0
    : false;
  const assistantPendingLabel = getAssistantPendingLabel({
    status,
    hasVisibleAssistantText,
  });
```

Move the existing `getMessageText` function above this block so it is defined before use.

- [ ] **Step 5: Render the pending row after virtualized messages**

In `MessageList`, after the closing `</div>` for the virtualized message container and before the parent `</div>`, add:

```tsx
          {assistantPendingLabel && (
            <m.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              transition={defaultTransition}
              className="group mt-2 mb-8 flex items-start gap-2"
              aria-live="polite"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-xs ring-1 ring-inset ring-white/10">
                <Brain className="h-5 w-5" />
              </div>
              <div className="flex max-w-[85%] flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-semibold text-foreground/80">
                    Anthon
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-white/10 bg-background/60 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{assistantPendingLabel}</span>
                </div>
              </div>
            </m.div>
          )}
```

- [ ] **Step 6: Pass status from the conversation client**

In `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`, update the `MessageList` call:

```tsx
        <MessageList
          messages={streamingMessages}
          status={status}
          isLoading={isLoading}
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/chat-reactivity-ui.test.ts' 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add 'src/app/(chat)/components/MessageList.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/layout.test.tsx'
git commit -m "feat: show chat assistant pending feedback"
```

Expected: commit succeeds with pending-state UI wiring and tests.

---

## Task 3: Localize Active Chat Microcopy

**Files:**
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/components/ChatHeader.tsx`
- Modify: `src/app/(chat)/components/SuggestedActions.tsx`
- Modify: `src/app/(chat)/components/ChatInput.tsx`
- Modify: `src/app/(chat)/chat/layout.test.tsx`

- [ ] **Step 1: Add source-level copy regression checks**

In `src/app/(chat)/chat/layout.test.tsx`, add:

```ts
  it("keeps active chat interaction copy in Italian", () => {
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );
    const chatHeader = readFileSync(
      "src/app/(chat)/components/ChatHeader.tsx",
      "utf8",
    );
    const suggestedActions = readFileSync(
      "src/app/(chat)/components/SuggestedActions.tsx",
      "utf8",
    );
    const chatInput = readFileSync(
      "src/app/(chat)/components/ChatInput.tsx",
      "utf8",
    );

    expect(messageList).toContain("Carico i messaggi precedenti");
    expect(messageList).toContain("Carica messaggi precedenti");
    expect(messageList).not.toContain("Loading older messages");
    expect(messageList).not.toContain("Load older messages");
    expect(conversationClient).toContain("Modifica del messaggio fallita");
    expect(conversationClient).toContain("Rigenerazione della risposta fallita");
    expect(chatHeader).toContain("Esporta");
    expect(chatHeader).toContain("Chat esportata");
    expect(chatHeader).toContain("Esportazione chat fallita");
    expect(chatHeader).not.toContain("Export");
    expect(suggestedActions).toContain("Mostra altro");
    expect(suggestedActions).toContain("Mostra meno");
    expect(suggestedActions).not.toContain("More");
    expect(suggestedActions).not.toContain("Less");
    expect(chatInput).toContain("File caricato");
    expect(chatInput).toContain("Caricamento file fallito");
  });
```

- [ ] **Step 2: Run the targeted layout test and verify it fails**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: FAIL because English copy is still present.

- [ ] **Step 3: Localize `MessageList` copy**

In `MessageList`, replace:

```tsx
toast.error("Failed to save feedback");
```

with:

```tsx
toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
```

Replace:

```tsx
<span>Loading older messages...</span>
```

with:

```tsx
<span>{CHAT_REACTIVITY_COPY.olderMessagesLoading}</span>
```

Replace:

```tsx
Load older messages
```

with:

```tsx
{CHAT_REACTIVITY_COPY.loadOlderMessages}
```

- [ ] **Step 4: Localize `ChatConversationClient` failures**

In `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`, add:

```ts
import { CHAT_REACTIVITY_COPY } from "../chat-reactivity-ui";
```

Replace:

```ts
toast.error("Invio messaggio fallito");
```

with:

```ts
toast.error(CHAT_REACTIVITY_COPY.submitFailed);
```

Replace:

```ts
toast.error("Failed to edit message");
```

with:

```ts
toast.error(CHAT_REACTIVITY_COPY.editFailed);
```

Replace:

```ts
toast.error("Failed to regenerate response");
```

with:

```ts
toast.error(CHAT_REACTIVITY_COPY.regenerateFailed);
```

- [ ] **Step 5: Localize `ChatHeader` copy**

In `src/app/(chat)/components/ChatHeader.tsx`, add:

```ts
import { CHAT_REACTIVITY_COPY } from "../chat/chat-reactivity-ui";
```

Replace:

```ts
throw new Error("Export failed");
```

with:

```ts
throw new Error(CHAT_REACTIVITY_COPY.exportFailed);
```

Replace:

```tsx
toast.success("Chat exported successfully");
```

with:

```tsx
toast.success(CHAT_REACTIVITY_COPY.exportSuccess);
```

Replace:

```tsx
toast.error("Failed to export chat");
```

with:

```tsx
toast.error(CHAT_REACTIVITY_COPY.exportFailed);
```

Replace:

```tsx
title="Click to rename"
```

with:

```tsx
title={CHAT_REACTIVITY_COPY.renameTitle}
```

Replace:

```tsx
<span className="hidden sm:inline">Export</span>
```

with:

```tsx
<span className="hidden sm:inline">{CHAT_REACTIVITY_COPY.exportLabel}</span>
```

- [ ] **Step 6: Localize `SuggestedActions` copy**

In `src/app/(chat)/components/SuggestedActions.tsx`, add:

```ts
import { CHAT_REACTIVITY_COPY } from "../chat/chat-reactivity-ui";
```

Replace:

```tsx
Less
```

with:

```tsx
{CHAT_REACTIVITY_COPY.showLess}
```

Replace:

```tsx
More
```

with:

```tsx
{CHAT_REACTIVITY_COPY.showMore}
```

- [ ] **Step 7: Localize `ChatInput` upload copy**

In `src/app/(chat)/components/ChatInput.tsx`, add:

```ts
import { CHAT_REACTIVITY_COPY } from "../chat/chat-reactivity-ui";
```

Replace:

```ts
toast.error("File too large. Maximum size is 10MB.");
```

with:

```ts
toast.error(CHAT_REACTIVITY_COPY.uploadTooLarge);
```

Replace:

```ts
throw new Error("Upload failed");
```

with:

```ts
throw new Error(CHAT_REACTIVITY_COPY.uploadFailed);
```

Replace:

```ts
toast.success("File uploaded successfully");
```

with:

```ts
toast.success(CHAT_REACTIVITY_COPY.uploadSuccess);
```

Replace:

```ts
toast.error("Failed to upload file");
```

with:

```ts
toast.error(CHAT_REACTIVITY_COPY.uploadFailed);
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/chat-reactivity-ui.test.ts' 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add 'src/app/(chat)/components/MessageList.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/components/ChatHeader.tsx' 'src/app/(chat)/components/SuggestedActions.tsx' 'src/app/(chat)/components/ChatInput.tsx' 'src/app/(chat)/chat/layout.test.tsx'
git commit -m "fix: localize active chat microcopy"
```

Expected: commit succeeds with only microcopy and tests.

---

## Task 4: Lighten Composer and Add Accessible Labels

**Files:**
- Modify: `src/app/(chat)/components/ChatInput.tsx`
- Modify: `src/app/(chat)/components/AudioRecorder.tsx`
- Modify: `src/app/(chat)/components/Attachments.tsx` if `AttachmentButton` does not already expose an accessible label
- Modify: `src/app/(chat)/chat/layout.test.tsx`

- [ ] **Step 1: Add source-level accessibility and stability checks**

In `src/app/(chat)/chat/layout.test.tsx`, add:

```ts
  it("keeps composer controls accessible and visually stable", () => {
    const chatInput = readFileSync(
      "src/app/(chat)/components/ChatInput.tsx",
      "utf8",
    );
    const audioRecorder = readFileSync(
      "src/app/(chat)/components/AudioRecorder.tsx",
      "utf8",
    );

    expect(chatInput).toContain('aria-label="Invia messaggio"');
    expect(chatInput).toContain('aria-label="Interrompi risposta"');
    expect(chatInput).toContain("isUploading");
    expect(chatInput).toContain("rounded-[1.35rem]");
    expect(chatInput).toContain("safe-area-bottom");
    expect(audioRecorder).toContain("aria-label={");
  });
```

- [ ] **Step 2: Run the targeted layout test and verify it fails**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: FAIL until the composer labels and visual class are updated.

- [ ] **Step 3: Refine `ChatInput` shell classes**

In `src/app/(chat)/components/ChatInput.tsx`, replace the outer wrapper class:

```tsx
className="relative mx-auto w-full min-w-0 shrink-0 max-w-3xl px-3 sm:px-4 pb-6 sm:pb-8 pt-2 safe-area-bottom"
```

with:

```tsx
className="relative mx-auto w-full min-w-0 shrink-0 max-w-3xl px-3 pb-4 pt-2 sm:px-4 sm:pb-5 safe-area-bottom"
```

Replace the form class:

```tsx
className="relative flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:bg-muted/40 dark:ring-white/10 transition-all focus-within:ring-2 focus-within:ring-primary/20"
```

with:

```tsx
className="relative flex items-end gap-1.5 rounded-[1.35rem] border border-border/60 bg-background/85 p-1.5 shadow-sm backdrop-blur-xl ring-1 ring-black/5 transition-all focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15 dark:border-white/10 dark:bg-background/70 dark:ring-white/10 sm:gap-2"
```

Replace the textarea class:

```tsx
className="min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground/50 max-h-[200px] overflow-y-auto scrollbar-none"
```

with:

```tsx
className="max-h-[200px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-sm leading-6 outline-none scrollbar-none placeholder:text-muted-foreground/55 disabled:cursor-not-allowed disabled:opacity-70"
```

- [ ] **Step 4: Add send and stop labels**

In the stop `Button`, add:

```tsx
aria-label="Interrompi risposta"
```

In the submit `Button`, add:

```tsx
aria-label="Invia messaggio"
```

- [ ] **Step 5: Make uploading state explicit**

Change the submit button disabled expression from:

```tsx
disabled={!input.trim() && attachments.length === 0}
```

to:

```tsx
disabled={isUploading || (!input.trim() && attachments.length === 0)}
```

Add this compact status block immediately before the `<form>`:

```tsx
      {isUploading && (
        <div className="mb-2 px-2 text-xs text-muted-foreground">
          Carico il file...
        </div>
      )}
```

- [ ] **Step 6: Add voice button accessible label**

In `src/app/(chat)/components/AudioRecorder.tsx`, add this before the `return`:

```ts
  const buttonLabel = isRecording
    ? "Ferma registrazione"
    : "Registra messaggio vocale";
```

Add it to the `Button`:

```tsx
aria-label={buttonLabel}
```

- [ ] **Step 7: Check attachment button accessible label**

Open `src/app/(chat)/components/Attachments.tsx`. If `AttachmentButton` lacks an `aria-label`, add one to its button:

```tsx
aria-label="Allega file"
```

If it already has an equivalent Italian accessible label, leave the file unchanged.

- [ ] **Step 8: Run targeted tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add 'src/app/(chat)/components/ChatInput.tsx' 'src/app/(chat)/components/AudioRecorder.tsx' 'src/app/(chat)/components/Attachments.tsx' 'src/app/(chat)/chat/layout.test.tsx'
git commit -m "style: refine chat composer responsiveness"
```

Expected: commit succeeds. If `Attachments.tsx` was unchanged, omit it from `git add`.

---

## Task 5: Full Verification and Browser Check

**Files:**
- No new code files unless verification reveals a defect.

- [ ] **Step 1: Run chat targeted tests**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/chat-reactivity-ui.test.ts' 'src/app/(chat)/chat/layout.test.tsx'
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS. If Biome reports formatting issues in touched files, run `bun run format` only if it does not rewrite unrelated files; otherwise use targeted formatting or manual fixes.

- [ ] **Step 3: Run the full unit test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Start or reuse the dev server**

If no server is already available on `http://localhost:3000`, run:

```bash
bun run dev
```

Expected: Next.js starts and prints a local URL. Use `http://localhost:3000`, not `127.0.0.1`, for browser verification in this repo.

- [ ] **Step 5: Browser verify the active chat flow**

Open:

```text
http://localhost:3000/chat
```

Verify:

- Creating/opening an active chat still works.
- Submitting a message clears the composer quickly.
- The stop button appears during the request.
- Before assistant text appears, the assistant pending row shows "Leggo il contesto" or "Sto preparando la risposta".
- Once text streams, the pending row disappears and streaming text is the feedback.
- Upload, older-message, export, feedback, edit, regenerate, and suggestion labels are Italian where visible.
- Composer controls stay aligned on narrow and desktop widths.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional files are modified. Existing benchmark changes that predated this work may still appear, but they must remain uncommitted unless explicitly requested.

---

## Self-Review

### Spec coverage

- Immediate submit feedback: Task 1 helper copy, Task 2 pending state, Task 3 submit failure copy, Task 4 composer state clarity.
- Assistant waiting state: Task 1 helper tests and Task 2 render wiring.
- Composer treatment: Task 4.
- Copy consistency: Task 3.
- Error handling: Task 3 copy changes and Task 5 browser verification.
- Test strategy: Tasks 1-5 include targeted, lint, full unit, and browser checks.
- Non-goals: no task changes models, RAG, billing, rate limits, backend routes, or voice architecture.

### Placeholder scan

No TBD, TODO, placeholder, or "implement later" steps are present. Every code-changing step includes concrete code or an exact replacement.

### Type consistency

`ChatRequestStatus` matches the AI SDK statuses used by `useChat`: `submitted`, `streaming`, `ready`, and `error`. `MessageList` receives `status={status}` from `ChatConversationClient`, and `getAssistantPendingLabel` consumes the same type.
