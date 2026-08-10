# Mobile Landing Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/chat` mobile landing page show the writing bar immediately and render compact starter suggestions in a two-column grid.

**Architecture:** Keep the landing page as the source of the welcome and starter content. Split its layout into a scrollable content region and the existing shared `ChatInput` docked below it; pass typed text to `createChat` as the pending initial message. Apply responsive utility classes to the existing starter cards without changing their copy or click behavior.

**Tech Stack:** Next.js 16.3 App Router, React, TypeScript, Tailwind CSS utilities, Vitest, Testing Library, Biome.

## Global Constraints

- Preserve the three existing starter prompts and existing `createChat` behavior.
- Use the shared `ChatInput`; do not create a second composer implementation.
- Keep the landing composer text-only until a conversation ID exists; attachment controls remain available after navigation into a conversation.
- Preserve unrelated worktree changes and use Biome formatting.
- Verify the relevant mobile route in a browser when the dev server is available.

### Task 1: Add the landing composer regression

**Files:**
- Modify: `src/app/(chat)/chat/page.test.tsx`

**Interfaces:**
- Consumes: `ChatPage`, its existing mocked `createChat`, and the page's `ChatInput` accessibility contract.
- Produces: A regression test for the initial landing textbox and typed-message submission.

- [ ] **Step 1: Write the failing test**

Add a test in `describe("chat landing page", ...)` that renders the default landing page, types into `screen.getByRole("textbox", { name: "Scrivi un messaggio" })`, submits the form, and expects `createChat` to receive `{ initialMessage: "Vorrei prepararmi" }`.

```tsx
it("keeps the writing bar available on the landing page", async () => {
  const user = userEvent.setup();
  render(<ChatPage />);

  await user.type(
    screen.getByRole("textbox", { name: "Scrivi un messaggio" }),
    "Vorrei prepararmi",
  );
  await user.click(screen.getByRole("button", { name: "Invia messaggio" }));

  expect(mocks.createChat).toHaveBeenCalledWith({
    initialMessage: "Vorrei prepararmi",
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bunx vitest run 'src/app/(chat)/chat/page.test.tsx'`

Expected: FAIL because the landing page currently does not render a textbox named `Scrivi un messaggio`.

- [ ] **Step 3: Commit the failing test**

```bash
git add 'src/app/(chat)/chat/page.test.tsx'
git commit -m "test(chat): cover landing composer availability"
```

### Task 2: Dock the shared composer and compact the starter grid

**Files:**
- Modify: `src/app/(chat)/chat/page.tsx`

**Interfaces:**
- Consumes: `createChat`, `isGuest`, and `isCreatingChat` from `useChatContext`; shared `ChatInput` props.
- Produces: An always-available landing composer and responsive starter-card layout.

- [ ] **Step 1: Add the landing input state and shared composer import**

Import `ChatInput`, destructure `isCreatingChat`, and add `const [landingInput, setLandingInput] = useState("");` beside the existing landing state.

- [ ] **Step 2: Split the landing shell into scrollable content plus composer**

Change the page wrapper to `overflow-hidden`. Wrap the current centered landing content in `min-h-0 flex-1 overflow-y-auto`, leaving the existing routine and return-path content inside that region. Render:

```tsx
<ChatInput
  input={landingInput}
  setInput={setLandingInput}
  onInputWarmup={() => undefined}
  onSubmit={() => {
    void createChat({ initialMessage: landingInput });
  }}
  isLoading={false}
  onStop={() => undefined}
  disableAttachments
  disabledReason={isCreatingChat ? "Apertura della conversazione…" : undefined}
/>
```

Use `isCreatingChat` only as the disabled state; do not replace the composer with a stop button because chat creation is not cancellable.

- [ ] **Step 3: Apply the mobile two-column compact card classes**

Change the starter grid to `grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3`. At mobile widths use compact padding, icon, title, description, and minimum height; retain the current larger values behind `sm:`. Keep the card buttons and prompts unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bunx vitest run 'src/app/(chat)/chat/page.test.tsx'`

Expected: PASS, including the new composer test and all existing landing-page tests.

- [ ] **Step 5: Run formatting and diff checks**

Run: `bunx biome check 'src/app/(chat)/chat/page.tsx' 'src/app/(chat)/chat/page.test.tsx' && git diff --check`

Expected: exit 0 with no formatting or whitespace errors.

### Task 3: Verify the complete change

**Files:**
- Review: `src/app/(chat)/chat/page.tsx`
- Review: `src/app/(chat)/chat/page.test.tsx`
- Review: `docs/superpowers/specs/2026-08-10-mobile-landing-composer-design.md`
- Review: `docs/superpowers/plans/2026-08-10-mobile-landing-composer.md`

**Interfaces:**
- Consumes: the implementation and focused regression from Tasks 1–2.
- Produces: fresh test, lint, and runtime evidence for the requested mobile behavior.

- [ ] **Step 1: Run the full unit test suite**

Run: `bun run test`

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Verify the mobile route in the collaborative preview**

Open `/chat` at a mobile viewport (390px wide or the closest available preset). Confirm the textbox named `Scrivi un messaggio` is visible without scrolling and that the starter card buttons occupy two columns. If the existing dev server remains unavailable, report the runtime verification gap explicitly rather than inferring it from source.

- [ ] **Step 3: Review the final diff and commit the implementation**

Run: `git diff --stat && git diff --check && git status --short`

Then commit only the scoped implementation and test files if verification is green:

```bash
git add 'src/app/(chat)/chat/page.tsx' 'src/app/(chat)/chat/page.test.tsx'
git commit -m "fix(chat): keep mobile landing composer visible"
```
