# Plan 019: Add behavioral coverage for stateful chat interactions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- package.json bun.lock vitest.config.ts 'src/app/(chat)/components/MessageList.tsx' 'src/app/(chat)/components/MessageList.behavior.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' 'src/app/(chat)/chat/layout.test.tsx'`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

The chat message list owns optimistic feedback, rollback after failed requests, editing callbacks, lazy-history loading, pending-response timers, and virtualized rendering. The current `layout.test.tsx` protects many of these features by reading source files and asserting strings; those tests pass even when the rendered controls stop working or state transitions regress. Add focused DOM-level tests for the highest-risk user interactions, while retaining source assertions only for genuinely structural CSS/layout constraints.

## Current state

- `src/app/(chat)/components/MessageList.tsx:138-200` initializes per-message feedback state, the negative-reason menu, saving state, pending-response state, and the virtualizer.
- `src/app/(chat)/components/MessageList.tsx:253-335` optimistically changes feedback, persists it with `fetch`, and restores prior state on failure.
- `src/app/(chat)/components/MessageList.tsx:380-413` renders the empty state and lazy-history controls.
- `src/app/(chat)/components/MessageList.tsx:578-600` renders the controlled edit textarea and save/cancel callbacks.
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx:117-159` owns refresh and older-message pagination, including fetch failure and loading cleanup; it has no rendered behavioral suite.
- `src/app/(chat)/chat/layout.test.tsx:177-207` and `:209-230` currently use `readFileSync(...).toContain(...)` to claim progress and feedback behavior exists. These are implementation-text checks, not interaction tests.
- The test environment is globally `node` (`vitest.config.ts:4-8`) and the repo does not currently declare Testing Library or a DOM implementation. Add file-level `// @vitest-environment jsdom` to the new behavior test rather than changing every test to jsdom.
- Follow the repository's colocated `*.test.tsx` convention, Vitest mocks, two-space indentation, and Biome import organization. Keep the production component API unchanged unless a tiny accessibility label is required to select an icon-only control by role.

Relevant current excerpt (`MessageList.tsx:253-280`):

```tsx
const newFeedback = currentFeedback === feedback ? 0 : feedback;
setFeedbackState((prev) => ({ ...prev, [messageId]: newFeedback }));
if (newFeedback === -1) {
  setFeedbackReasonMenuMessageId(messageId);
}
try {
  await submitFeedback(feedbackEndpoint, messageId, newFeedback);
} catch {
  setFeedbackState((prev) => ({ ...prev, [messageId]: currentFeedback }));
  setFeedbackReasonMenuMessageId(null);
  toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Add test dependencies | `bun add -d @testing-library/react @testing-library/user-event jsdom` | exit 0; `package.json` and `bun.lock` updated |
| Targeted tests | `bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx' 'src/app/(chat)/chat/layout.test.tsx'` | exit 0; all selected tests pass |
| Lint/type/test gate | `bun run verify` | exit 0; Biome, TypeScript, and all unit tests pass |

## Scope

**In scope** (the only files you should modify):

- `package.json`
- `bun.lock`
- `src/app/(chat)/components/MessageList.behavior.test.tsx` (create)
- `src/app/(chat)/components/MessageList.tsx` (only if an accessible name/test seam is strictly required)
- `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx` (create)
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx` (only if a narrow injectable seam or accessible name is strictly required)
- `src/app/(chat)/chat/layout.test.tsx` (remove only source-string assertions replaced by behavior tests)

**Out of scope**:

- Changing chat submission, AI transport, API payloads, or optimistic edit/delete product behavior; tests may characterize those existing contracts.
- Visual redesign, animation changes, virtualizer behavior changes, API behavior, or feedback payload changes.
- Snapshot tests of the entire component or replacing structural mobile-layout assertions.
- Browser E2E infrastructure.

## Git workflow

- Branch: `advisor/019-chat-ui-behavior-tests`.
- Use a conventional commit such as `test(chat): cover stateful message interactions`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Install a minimal DOM interaction test stack

Add `@testing-library/react`, `@testing-library/user-event`, and `jsdom` as dev dependencies with Bun. Do not change the global Vitest environment; the new test must opt into jsdom with its file directive.

**Verify**: `bun pm ls | rg '@testing-library/react|@testing-library/user-event|jsdom'` → all three direct dev dependencies are listed.

### Step 2: Create a deterministic MessageList render harness

Create `MessageList.behavior.test.tsx`. Mock animation, clipboard, markdown/voice/comparison children, toast, and `useMessageVirtualizer` at module boundaries. The virtualizer mock must return every input row with stable indices/keys and a parent ref so tests exercise `MessageList` state without depending on element measurement. Provide a `renderMessageList(overrides)` helper with stable default callbacks and at least one user plus one assistant `ChatUIMessage`; use accessible role/name queries, never source reads, class selectors, or a full-tree snapshot.

**Verify**: `bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx'` → test module loads under jsdom and a smoke test finds the assistant content by visible text.

### Step 3: Cover the critical state transitions

Add behavioral tests that:

1. click negative feedback, observe the reason choices, choose `Fatto sbagliato`, and assert the two POST bodies (`feedback: -1`, then `feedback: -1, reason: "wrong_fact"`);
2. reject the feedback request, assert optimistic pressed state is rolled back and the localized failure toast is called;
3. start from persisted negative feedback plus a persisted reason, remove it, and assert UI state plus the `feedback: 0` request;
4. render `editingMessageId`, type in the controlled edit box, and assert `onEditContentChange`, `onEditSave`, and `onEditCancel` are invoked from their visible controls;
5. render `hasMoreMessages`, click the older-messages button once, and assert `onLoadMore` once; rerender with `isLoadingMore` and assert the button is replaced by the loading status;
6. use fake timers with `status="submitted"` and assert the pending label changes at `ASSISTANT_READING_MAX_MS`, then reset timers in cleanup.

If icon-only feedback buttons lack stable accessible names, add concise Italian `aria-label` values in `MessageList.tsx`; do not export private handlers or add production-only test IDs.

**Verify**: `bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx'` → all six behavior groups pass without source reads or snapshots.

### Step 4: Retire only superseded source-string checks

In `layout.test.tsx`, delete assertions whose promised behavior is now covered by the new interaction tests (feedback options/removal and MessageList pending-state anchors). Preserve viewport sizing, shrinkability, colors, copy, and other structural contracts that are not rendered in the new suite.

**Verify**: `bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx' 'src/app/(chat)/chat/layout.test.tsx'` → both files pass.

### Step 5: Characterize conversation pagination and recovery

Create `chat-conversation-client.behavior.test.tsx` with narrow mocks for `useChat`, transport construction, confirmation UI, and child components. Exercise the actual rendered client and verify: older-message pagination prepends results without reordering the existing window; repeated clicks while loading issue one request; a failed pagination request preserves messages, clears loading, and surfaces the existing toast; refresh failure leaves the current state intact; and edit/delete/regenerate failure paths do not leave their in-flight guards stuck. Do not test private functions or duplicate route-level persistence tests.

**Verify**: `bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'` → all pagination and recovery cases pass.

### Step 6: Run the full verification gate

Run the repository gate and inspect scope.

**Verify**: `bun run verify && git diff --check && git status --short` → commands exit 0; status lists only the in-scope files plus the executor-owned `plans/README.md` status update.

## Test plan

- New file: `src/app/(chat)/components/MessageList.behavior.test.tsx`.
- New file: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`.
- Cover successful feedback persistence, request failure rollback, persisted-state removal, controlled editing callbacks, lazy history, and time-driven pending copy.
- Prefer `userEvent` for interactions and `waitFor` for asynchronous state. Restore real timers and global `fetch` after each test.
- Do not assert Tailwind strings or internal hook calls except at deliberately mocked boundaries.

## Done criteria

- [ ] The new suite renders and interacts with `MessageList` in jsdom.
- [ ] At least the six state-transition groups in Step 3 pass.
- [ ] Pagination ordering, duplicate-load suppression, and failure recovery are exercised through the conversation client.
- [ ] No new test reads component source or uses a full-tree snapshot.
- [ ] Superseded source-string assertions are removed; unrelated structural assertions remain.
- [ ] `bun run verify` and `git diff --check` exit 0.
- [ ] Only in-scope files and the index status row are modified.

## STOP conditions

- The current handlers or rendered controls no longer match the excerpts or described states.
- Testing the component requires changing its public behavior, virtualizer implementation, or backend contract.
- The selected DOM stack introduces a React 19 peer-dependency conflict that Bun cannot resolve cleanly.
- A step's verification fails twice after a reasonable correction.

## Maintenance notes

Keep these tests centered on user-visible state and network/callback effects. When feedback, editing, or pagination controls change, update role/name queries and expected payloads; do not fall back to reading source strings. A later browser E2E suite can cover layout and real scrolling, but should complement rather than duplicate these fast component tests.
