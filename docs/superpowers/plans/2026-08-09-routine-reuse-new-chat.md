# Routine Reuse From New Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved routines reusable from `/chat/routines` by creating independent repeat/adapt chats, preserving routine attempts and adaptation lineage without routing through the source chat.

**Architecture:** Keep `Routine` owner-scoped and use its source chat/message fields only as nullable provenance. Add a client-only routine-chat context carried through `LayoutClient`'s existing pending-message mechanism; adaptation context is consumed by `ChatConversationClient` so a newly saved proposal receives `derivedFromRoutineId`. Move collection actions to explicit buttons and reuse the existing attempt, outcome, archive, and history APIs directly from the collection page.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, Vitest Testing Library, Prisma/PostgreSQL, existing routine client/API contracts, Biome.

## Global Constraints

- Preserve the existing pending initial-message flow and one-send behavior; do not alter composer, streaming throttle, viewport sizing, or message virtualization.
- Routine source references are provenance only; collection actions must not navigate to or require the source chat.
- All routine mutations remain authenticated owner-scoped; guests receive registration CTA and no persistent action.
- Keep original routines immutable during Repeat/Modify; only a newly accepted proposal can create a new `Routine` record.
- Preserve existing `derivedFromRoutineId` schema and API validation; no new version table or migration is needed.
- Maintain Italian copy, 44px touch targets, reduced-motion classes, loading/error/empty/pagination states, and current mobile/desktop layout direction.

---

### Task 1: Add routine-chat prompt and context contracts

**Files:**
- Create: `src/lib/coaching/routine-chat.ts`
- Test: `src/lib/coaching/routine-chat.test.ts`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Test: `src/app/(chat)/chat/layout-client.test.tsx`

**Interfaces:**
- `type RoutineChatMode = "repeat" | "adapt"`.
- `interface PendingRoutineChatContext { mode: RoutineChatMode; routineId: string }`.
- `buildRoutineChatPrompt(routine: RoutineCardData, mode: RoutineChatMode): string` returns an Italian prompt containing title, trigger, duration, every normalized practice step, completion cue, and no database IDs.
- `ChatContext.createRoutineChat(routine: RoutineCardData, mode: RoutineChatMode): Promise<string | null>` creates a private chat through the existing `createChat` path.
- `ChatContext.consumePendingRoutineChatContext(chatId: string): PendingRoutineChatContext | null` consumes the one-shot client context for the new conversation.

- [ ] **Step 1: Write failing prompt and context tests**

Add tests proving:

```ts
expect(buildRoutineChatPrompt(routine, "repeat")).toContain(routine.proposal.title);
expect(buildRoutineChatPrompt(routine, "repeat")).toContain("Ripeti");
expect(buildRoutineChatPrompt(routine, "adapt")).toContain("adattare");
expect(buildRoutineChatPrompt(routine, "repeat")).not.toContain(routine.id);
```

Extend `layout-client.test.tsx` with a context probe that calls `createRoutineChat`, asserts the new chat POST only contains the chat title, and then consumes the context exactly once for the returned chat ID.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bunx vitest run src/lib/coaching/routine-chat.test.ts 'src/app/(chat)/chat/layout-client.test.tsx'
```

Expected: the prompt module and context methods are missing.

- [ ] **Step 3: Implement the pure prompt builder**

Use `normalizeRoutineProposal` so v1 and v2 records produce the same readable format. Keep the prompt explicit about mode:

```ts
const modeInstruction =
  mode === "repeat"
    ? "Guidami nella stessa sequenza senza modificarla."
    : "Aiutami a capire cosa cambiare e proponi una nuova versione.";
```

Render routine fields as plain Italian text; never include routine IDs, source chat IDs, or internal metadata.

- [ ] **Step 4: Extend `LayoutClient` with one-shot routine context**

Add `routineContext?: PendingRoutineChatContext` to `CreateChatOptions`, a `pendingRoutineChatContextsRef` map keyed by chat ID, and `consumePendingRoutineChatContext` to the context value. Implement `createRoutineChat` by calling:

```ts
createChat({
  title: `${mode === "repeat" ? "Ripeti" : "Adatta"}: ${routine.proposal.title}`,
  initialMessage: buildRoutineChatPrompt(routine, mode),
  routineContext: { mode, routineId: routine.id },
});
```

The existing API POST remains `{ title }`; the routine context stays client-side and is removed after consumption.

- [ ] **Step 5: Run focused tests and commit**

Run the tests from Step 2 and `bunx biome check` on the four files. Commit:

```bash
git add src/lib/coaching/routine-chat.ts src/lib/coaching/routine-chat.test.ts 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/layout-client.test.tsx'
git commit -m "feat(chat): add reusable routine chat context"
```

---

### Task 2: Carry Adapt lineage into a newly created conversation

**Files:**
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Test: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

**Interfaces:**
- The initial-message effect consumes `PendingRoutineChatContext` before the first automatic send.
- `mode: "adapt"` seeds `submittedRoutineAdaptationRef` with the new chat's existing assistant-message IDs and the source `routineId`.
- `mode: "repeat"` sends the prompt without setting `derivedFromRoutineId`.

- [ ] **Step 1: Add RED behavior tests**

Mock the context consumer and routine save client, then cover:

```ts
expect(saveRoutineProposal).toHaveBeenCalledWith(
  "new-assistant-message",
  { derivedFromRoutineId: "routine-original" },
);
```

Also assert a Repeat context produces the prompt and does not pass `derivedFromRoutineId`, and that context is consumed once even if the component re-renders.

- [ ] **Step 2: Run the focused behavior test and verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

Expected: the new context is not consumed and the adaptation save payload is absent.

- [ ] **Step 3: Seed adaptation state in the automatic initial send**

In the existing `status === "ready"` pending-message effect, consume the context before `sendMessage`. For Adapt, set `submittedRoutineAdaptationRef` with the current assistant IDs; leave Repeat unset. Keep the existing `onFinish` discovery logic as the source of the newly generated assistant proposal ID.

- [ ] **Step 4: Run tests, typecheck, and commit**

Run the focused behavior test, `bun run typecheck`, and `bunx biome check` on the two files. Commit:

```bash
git add 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
git commit -m "feat(coaching): preserve routine adaptation lineage"
```

---

### Task 3: Replace collection navigation with repeat, adapt, history, check-in, and archive actions

**Files:**
- Modify: `src/app/(chat)/components/RoutineCollectionPage.tsx`
- Test: `src/app/(chat)/components/RoutineCollectionPage.test.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx` only if the final context action wiring needs a type adjustment

**Interfaces:**
- Collection cards call `createRoutineChat(routine, "repeat" | "adapt")`; they do not call `navigateToRoutine` or build source-chat hrefs.
- `RoutineHistory` remains the existing lazy attempt-history component.
- `RoutineCheckInForm` receives owner-safe callbacks that call `createRoutineAttempt` and `saveRoutineOutcome` for the selected routine.
- Archive uses existing `archiveRoutine` plus `useConfirm`, then refreshes the collection.

- [ ] **Step 1: Extend collection tests with RED action behavior**

Mock `createRoutineChat`, `createRoutineAttempt`, `saveRoutineOutcome`, `archiveRoutine`, `RoutineHistory`, and `RoutineCheckInForm`. Add tests for:

1. Repeat calls the context action with `"repeat"` and does not use a source link.
2. Modify calls the context action with `"adapt"` and leaves the original card present.
3. Archived cards hide Repeat but retain Modify and archive-safe history.
4. “Com’è andata?” creates a pending attempt when needed, opens the form, and saves the selected outcome.
5. Archive confirms, calls the existing API, and refreshes the collection.
6. Guest cards expose registration and none of the persistent actions.

- [ ] **Step 2: Run the focused collection test and verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/RoutineCollectionPage.test.tsx'
```

Expected: the current source-chat link and `navigateToRoutine` behavior fail the new action contract.

- [ ] **Step 3: Implement action-oriented cards**

Replace the card `<Link>` with an accessible `<article>` and action buttons. Keep title/trigger/duration/state and responsive classes. Use a per-routine pending action map so Repeat/Modify cannot double-submit and show a local retryable error when chat creation returns `null`.

Implement `Com’è andata?` as:

```ts
if (routine.latestAttempt?.outcome !== null) {
  await createRoutineAttempt(routine.id, crypto.randomUUID());
}
setOpenCheckInRoutineId(routine.id);
```

Refresh the collection after each successful mutation and replace the selected routine from the authoritative response before rendering the form. Preserve focus after the form closes.

- [ ] **Step 4: Add history/check-in/archive presentation**

Render `RoutineHistory` in progressive disclosure. Render `RoutineCheckInForm` only for the selected routine and an active pending attempt. Keep “Archivia” behind the shared confirmation dialog and hide it for archived cards. Do not offer Repeat for archived routines; allow Modify so a new active proposal can be created.

- [ ] **Step 5: Run focused tests and commit**

Run the collection tests, existing `RoutineHistory.test.tsx`, `RoutineCheckInForm.test.tsx`, and targeted Biome. Commit:

```bash
git add 'src/app/(chat)/components/RoutineCollectionPage.tsx' 'src/app/(chat)/components/RoutineCollectionPage.test.tsx'
git commit -m "feat(chat): add routine collection actions"
```

---

### Task 4: Make collection reads independent of deleted source chats

**Files:**
- Modify: `src/app/api/coaching/routines/route.ts`
- Test: `src/app/api/coaching/routines/route.test.ts`
- Test: `src/app/api/coaching/routines/route.integration.test.ts`

**Interfaces:**
- Authenticated collection GET returns owner routines when `sourceChatId` is null, when the source relation is deleted (`sourceChat` is null), or when the source chat remains private and owned by the requester.
- Public/foreign source chats remain excluded only where the existing privacy contract requires it.
- Routine POST for a modified proposal continues to validate the new assistant message and owner-check `derivedFromRoutineId`; it does not require the original routine's source chat.

- [ ] **Step 1: Add RED privacy/independence coverage**

Add a route test fixture with an owner routine whose source relation is absent and assert it appears in collection results. Add an integration case that deletes the source chat with `onDelete: SetNull`, then verifies the routine remains queryable and archivable by the owner.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
bunx vitest run 'src/app/api/coaching/routines/route.test.ts' 'src/app/api/coaching/routines/route.integration.test.ts'
```

Expected: the collection `where` clause currently omits a routine with a non-null orphaned `sourceChatId`.

- [ ] **Step 3: Update the collection ownership filter**

Add the nullable relation branch for a deleted source while retaining the private-owner branch and existing public/foreign privacy behavior. Do not weaken `userId: user.id` or mutation ownership checks.

- [ ] **Step 4: Run route tests, integration when credentials are available, and commit**

Run both route suites, `bunx prisma validate`, and `bunx biome check` on route files. Commit:

```bash
git add 'src/app/api/coaching/routines/route.ts' 'src/app/api/coaching/routines/route.test.ts' 'src/app/api/coaching/routines/route.integration.test.ts'
git commit -m "fix(coaching): keep orphaned routines in collection"
```

---

### Task 5: Full regression and browser verification

**Files:**
- Modify only tests discovered by the preceding tasks if a behavior contract requires a fixture update; do not stage unrelated `docs/user-plan-states.md` or `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`.

- [ ] **Step 1: Run all focused routine/chat tests**

```bash
bunx vitest run \
  src/lib/coaching/routine-chat.test.ts \
  'src/app/(chat)/components/RoutineCollectionPage.test.tsx' \
  'src/app/(chat)/chat/layout-client.test.tsx' \
  'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' \
  'src/app/api/coaching/routines/route.test.ts' \
  'src/app/api/coaching/routines/[routineId]/attempts/route.test.ts' \
  'src/app/(chat)/components/RoutineHistory.test.tsx' \
  'src/app/(chat)/components/RoutineCheckInForm.test.tsx'
```

- [ ] **Step 2: Run repository gates**

```bash
bun run test
bun run lint
bun run typecheck
git diff --check
bun run build
```

Record any pre-existing PostHog empty server-sourcemap warnings separately; they do not count as application failures when the build exits successfully.

- [ ] **Step 3: Verify the preview manually**

On an authenticated local account:

1. Open `/chat/routines` from the sidebar and confirm no source-chat link is rendered.
2. Click Repeat; verify a new chat opens with the routine prompt and the original remains unchanged.
3. Return to the collection, click Modify; verify the new chat asks for adaptation and accepting its proposal creates a derived routine.
4. Expand history, mark a new attempt, record each outcome once, and confirm the card refreshes without losing the routine.
5. Archive the original and verify it moves to Archived while the derived routine remains available.
6. Refresh after deleting the source chat and verify the orphaned routine still appears.
7. Repeat the navigation at mobile width and verify all controls remain reachable with the drawer closed correctly.

- [ ] **Step 4: Commit any final test-only fixture updates and report scope**

Use a conventional commit only for required fixture changes. Finish with `git status --short`, confirm the two unrelated docs remain untouched, and report commits, gates, preview coverage, and any environment limitation.
