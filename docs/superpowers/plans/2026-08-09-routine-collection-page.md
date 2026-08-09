# Pagina raccolta routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spostare l’elenco delle routine dalla sidebar a una pagina dedicata `/chat/routines`, lasciando nella sidebar solo un ingresso compatto.

**Architecture:** `LayoutClient` resta la sorgente unica della collection e della paginazione. `RoutineSidebarShelf` diventa un link compatto verso `/chat/routines`; una nuova pagina client presenta filtri, card desktop/lista mobile, loading/error/empty e usa le azioni già esposte da `ChatContext` per navigare alla chat sorgente.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind CSS, Vitest + Testing Library, Zod-backed routine client già esistente.

## Global Constraints

- La collection privata resta disponibile solo agli utenti autenticati non guest.
- Non introdurre una seconda API o una seconda sorgente di verità: usare `useChatContext().routineCollection` e le callback di `LayoutClient`.
- Tutti i controlli touch devono avere almeno 44×44px e copy italiano.
- I link a una routine devono riusare `navigateToRoutine` e mantenere il comportamento chat/check-in esistente.
- Rispettare `prefers-reduced-motion` e non modificare il composer o la logica di viewport della chat.

---

### Task 1: Ridurre la shelf sidebar a un ingresso di navigazione

**Files:**
- Modify: `src/app/(chat)/components/RoutineSidebarShelf.tsx`
- Test: `src/app/(chat)/components/RoutineSidebarShelf.test.tsx`

**Interfaces:**
- Consumes: `routineCollection` summary, `activeTotal`, `error`, `onRetry`, `isLoading`.
- Produces: an accessible link `Routine` with `href="/chat/routines"`, active-count summary, optional retry state, and no inline routine list/filter/pagination.

- [ ] **Step 1: Write the failing tests**

Add tests that render the shelf and assert:

```tsx
expect(screen.getByRole("link", { name: /Routine/ })).toHaveAttribute(
  "href",
  "/chat/routines",
);
expect(screen.queryByRole("button", { name: "Espandi routine" })).toBeNull();
expect(screen.queryByRole("tab", { name: "Archiviate" })).toBeNull();
expect(screen.queryByText("Reset rapido")).toBeNull();
```

Keep the existing error/retry assertion and add a 44px class assertion on the link/control.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/RoutineSidebarShelf.test.tsx'
```

Expected: the new link/list-removal assertions fail against the current expandable shelf.

- [ ] **Step 3: Implement the compact shelf**

Remove the expanded panel, filter state, routine item rendering, load-more control, and `onNavigate`/`onLoadMore` props. Render a `Link` to `/chat/routines` with `min-h-11`, the active count, and the latest title only as a non-interactive summary if useful; never render the collection entries in the sidebar.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the same Vitest command. Expected: all shelf tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(chat)/components/RoutineSidebarShelf.tsx' 'src/app/(chat)/components/RoutineSidebarShelf.test.tsx'
git commit -m "refactor(chat): move routine list out of sidebar"
```

### Task 2: Add the dedicated routine collection page

**Files:**
- Create: `src/app/(chat)/chat/routines/page.tsx`
- Create: `src/app/(chat)/components/RoutineCollectionPage.tsx`
- Create: `src/app/(chat)/components/RoutineCollectionPage.test.tsx`

**Interfaces:**
- Consumes: `useChatContext()` fields `routineCollection`, `routineCollectionError`, `isRoutineCollectionLoading`, `routineCollectionLoadingMoreStatus`, `refreshRoutineCollection`, `loadMoreRoutineCollection`, `navigateToRoutine`, and `isGuest`.
- Produces: route `/chat/routines` with active/archive tabs, accessible routine cards/list rows, retry/load-more actions, and source-chat navigation.

- [ ] **Step 1: Write the failing page/component tests**

Mock `useChatContext` with a collection containing one active and one archived routine. Cover:

```tsx
expect(screen.getByRole("heading", { name: "Le tue routine" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Attive" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
await user.click(screen.getByRole("button", { name: "Archiviate" }));
expect(screen.getByText("Routine archiviata")).toBeTruthy();
await user.click(screen.getByRole("link", { name: /Reset rapido/ }));
expect(mocks.navigateToRoutine).toHaveBeenCalledWith(archivedRoutine);
```

Also cover loading skeleton/status, empty active/archive copy, error retry, `Carica altre routine`, and guest registration CTA without private routine data.

- [ ] **Step 2: Run the new focused test to verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/RoutineCollectionPage.test.tsx'
```

Expected: the component/route modules are missing and the test fails before implementation.

- [ ] **Step 3: Implement the page and presentational collection**

Create a client page that renders `RoutineCollectionPage` inside the existing `PageWrapper`. Use `useChatContext` for data and callbacks. Keep the page layout stable:

```tsx
<PageWrapper className="flex min-h-0 flex-1 flex-col overflow-y-auto">
  <RoutineCollectionPage ... />
</PageWrapper>
```

Desktop cards show title, trigger, duration, status, latest outcome, and an accessible link/action to `navigateToRoutine`. Mobile uses the same semantic links in a compact single-column layout. Use `min-h-11 min-w-11` on buttons, `aria-pressed` on filters, `aria-live="polite"` for loading/error status, and `motion-reduce` classes only for small transitions.

For guest state, render a registration message/link and no routine entries. For authenticated state, retry calls `refreshRoutineCollection()` and pagination calls `loadMoreRoutineCollection(status)`.

- [ ] **Step 4: Run focused page tests to verify GREEN**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/RoutineCollectionPage.test.tsx' 'src/app/(chat)/components/RoutineSidebarShelf.test.tsx'
```

Expected: all page and sidebar tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(chat)/chat/routines/page.tsx' 'src/app/(chat)/components/RoutineCollectionPage.tsx' 'src/app/(chat)/components/RoutineCollectionPage.test.tsx'
git commit -m "feat(chat): add dedicated routine collection page"
```

### Task 3: Integrate route behavior and verify responsive navigation

**Files:**
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Test: `src/app/(chat)/chat/layout-client.test.tsx`
- Test: `src/app/(chat)/chat/page.test.tsx`

**Interfaces:**
- Consumes: the new static `/chat/routines` route and compact sidebar link.
- Produces: correct desktop/mobile route navigation, drawer close behavior, and no regressions on `/chat`, `/chat/[id]`, or `/chat/usage`.

- [ ] **Step 1: Write the failing integration assertions**

Extend layout tests to render the compact shelf in both desktop and mobile sidebar paths, click the `Routine` link, and assert its href and that the mobile sheet closes through the existing navigation flow. Add a route matrix assertion that `/chat/routines` is not classified as a conversation route.

- [ ] **Step 2: Run the focused layout/page tests to verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/page.test.tsx'
```

Expected: old shelf props/route assumptions fail until the integration is updated.

- [ ] **Step 3: Update only integration wiring**

Pass the reduced shelf props from both desktop and mobile `SidebarContents` calls. Ensure `/chat/routines` follows landing chrome rather than conversation chrome where pathname classification is used. Do not alter sidebar focus management or chat scroll behavior.

- [ ] **Step 4: Run the focused integration tests to verify GREEN**

Run the same Vitest command. Expected: layout/page tests pass with the new route.

- [ ] **Step 5: Run final verification**

```bash
bun run test
bun run typecheck
bunx prisma validate
bunx biome check 'src/app/(chat)/components/RoutineSidebarShelf.tsx' 'src/app/(chat)/components/RoutineCollectionPage.tsx' 'src/app/(chat)/chat/routines/page.tsx'
bun run build
git diff --check
```

Also verify `/chat/routines` in the T3 preview at desktop and 390px: sidebar shows only the Routine entry, desktop uses cards, mobile uses compact rows, and clicking a routine reaches its source chat/check-in.

- [ ] **Step 6: Commit integration and report**

```bash
git add 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/page.test.tsx'
git commit -m "test(chat): verify routine collection navigation"
```

