# Sidebar Search Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move conversation search from the full-width action beneath “Nuova Chat” to a lens icon beside the sidebar collapse control.

**Architecture:** Keep search state and the existing dialog in `LayoutClient`. Route the existing optional `onSearch` callback through `SidebarContents` to `SidebarHeader`, while `ChatList` becomes responsible only for chat creation and the conversation list.

**Tech Stack:** React 19, TypeScript, Next.js 16 App Router, Lucide React, Vitest, Testing Library.

## Global Constraints

- Preserve the existing search dialog, `Cmd+K` shortcut, focus restoration, desktop behavior, and mobile sheet behavior.
- Render search only when the existing optional callback is available.
- Do not modify unrelated dirty-worktree files.

---

### Task 1: Move the search trigger into the sidebar header

**Files:**
- Create: `src/app/(chat)/components/SidebarHeader.test.tsx`
- Modify: `src/app/(chat)/components/SidebarHeader.tsx`
- Modify: `src/app/(chat)/components/ChatList.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/chat/layout-client.test.tsx`

**Interfaces:**
- Consumes: `SidebarContentsProps.onSearch?: () => void`
- Produces: `SidebarHeaderProps.onSearch?: () => void`

- [ ] **Step 1: Write the failing header behavior tests**

```tsx
it("places conversation search before the collapse control", async () => {
  const user = userEvent.setup();
  const onSearch = vi.fn();
  render(<SidebarHeader onCollapse={vi.fn()} onSearch={onSearch} />);

  expect(
    screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Cerca nelle conversazioni", "Chiudi la barra laterale"]);
  await user.click(
    screen.getByRole("button", { name: "Cerca nelle conversazioni" }),
  );
  expect(onSearch).toHaveBeenCalledOnce();
});

it("omits conversation search when no callback is available", () => {
  render(<SidebarHeader onCollapse={vi.fn()} />);
  expect(
    screen.queryByRole("button", { name: "Cerca nelle conversazioni" }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run the new test and verify the missing header contract fails**

Run: `bunx vitest run 'src/app/(chat)/components/SidebarHeader.test.tsx'`

Expected: FAIL because `SidebarHeader` does not render a “Cerca nelle conversazioni” button.

- [ ] **Step 3: Implement the minimal component move**

Add the optional callback and a ghost icon button immediately before the collapse button in `SidebarHeader`:

```tsx
{onSearch ? (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-white/10"
    onClick={onSearch}
    aria-label="Cerca nelle conversazioni"
  >
    <Search className="h-4 w-4" />
  </Button>
) : null}
```

Wrap the search and collapse controls in a `flex` container. Pass `SidebarContents.onSearch` to `SidebarHeader`, remove `ChatListProps.onSearch`, remove the full-width search button from `ChatList`, and update the layout test’s `ChatList` mock so it no longer owns the search trigger.

- [ ] **Step 4: Run targeted tests**

Run: `bunx vitest run 'src/app/(chat)/components/SidebarHeader.test.tsx' 'src/app/(chat)/components/ChatList.test.tsx' 'src/app/(chat)/chat/layout-client.test.tsx'`

Expected: PASS with zero failures.

- [ ] **Step 5: Run scoped quality checks and runtime verification**

Run: `bunx biome check 'src/app/(chat)/components/SidebarHeader.tsx' 'src/app/(chat)/components/SidebarHeader.test.tsx' 'src/app/(chat)/components/ChatList.tsx' 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/layout-client.test.tsx'`

Then verify in the running Next.js app that the lens appears immediately left of the collapse control, the old full-width search row is absent, and the lens opens the existing dialog on desktop and mobile.

- [ ] **Step 6: Commit the verified implementation**

```bash
git add -- \
  'src/app/(chat)/components/SidebarHeader.tsx' \
  'src/app/(chat)/components/SidebarHeader.test.tsx' \
  'src/app/(chat)/components/ChatList.tsx' \
  'src/app/(chat)/chat/layout-client.tsx' \
  'src/app/(chat)/chat/layout-client.test.tsx'
git commit -m "feat(chat): move search into sidebar header"
```
