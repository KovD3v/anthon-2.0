# Profile Usage Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Chat, Utilizzo, and Prezzi from the sidebar account menu, move the complete daily usage summary into `/profile`, and make `/chat/usage` return a real 404.

**Architecture:** Add a focused client component beside the existing profile sections. It reads the existing `/api/usage` contract and owns only presentation state. Keep entitlement and rate-limit logic server-side, update every internal usage link to the profile anchor, and unregister the obsolete App Router page by deleting its `page.tsx`.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS, Base UI progress, Vitest, Testing Library.

## Global Constraints

- `/chat/usage` must return `404`; do not add a redirect, rewrite, or fallback.
- `/profile#utilizzo` is the internal destination for `Controlla utilizzo`.
- `/api/usage`, plan limits, billing behavior, and the chat threshold banner remain unchanged.
- Preserve unrelated dirty-worktree changes and commit only files owned by each task.
- Use `bun run` and `bunx`; use Biome for formatting and checks.
- Verify the finished profile and sidebar at desktop and 390 px widths.

---

### Task 1: Simplify the sidebar account menu

**Files:**
- Modify: `src/app/(chat)/components/SidebarBottom.test.tsx`
- Modify: `src/app/(chat)/components/SidebarBottom.tsx`

**Interfaces:**
- Consumes: `SidebarBottom()` and its `role="menuitem"` actions.
- Produces: an account menu without Chat, Utilizzo, or Prezzi; all remaining actions retain their current routes and behavior.

- [ ] **Step 1: Write the failing menu test**

Add a test that opens the real component and checks consumer-visible menu actions:

```tsx
it("keeps only account-level destinations in the menu", async () => {
  const user = userEvent.setup();
  render(<SidebarBottom />);

  await user.click(screen.getByRole("button", { name: "Apri menu account" }));

  expect(screen.queryByRole("menuitem", { name: "Chat" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Utilizzo" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Prezzi" })).toBeNull();
  expect(screen.getByRole("menuitem", { name: "Profilo e impostazioni" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Canali" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Assistenza" })).toBeTruthy();
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/SidebarBottom.test.tsx'
```

Expected: the new test fails because Chat, Utilizzo, and Prezzi are still present.

- [ ] **Step 3: Remove the three destinations**

Delete the three `menuItems` entries and the now-unused `MessageSquare`, `BarChart3`, and `CreditCard` imports. Do not change menu styling, animation, focus handling, or any other action.

- [ ] **Step 4: Verify GREEN**

Run the same focused Vitest command and `bunx biome check` on the two files. Expected: all SidebarBottom tests pass and Biome reports no issues.

- [ ] **Step 5: Commit**

```bash
git add -- 'src/app/(chat)/components/SidebarBottom.tsx' 'src/app/(chat)/components/SidebarBottom.test.tsx'
git commit -m 'refactor(chat): simplify sidebar account menu'
```

---

### Task 2: Build the profile usage section

**Files:**
- Create: `src/app/(marketing)/profile/components/UsageSection.test.tsx`
- Create: `src/app/(marketing)/profile/components/UsageSection.tsx`

**Interfaces:**
- Consumes: `GET /api/usage` returning `UsageData` from `@/types/chat`.
- Produces: `UsageSection(): ReactNode`, with root `id="utilizzo"`, local loading/error/success states, a semantic progress bar, and an optional `/pricing` CTA.

- [ ] **Step 1: Write failing success and error tests**

Use a complete literal `UsageData` fixture. The success test must assert the visible plan, remaining count, used count, progress values, and upgrade href. The error test must return `{ ok: false }` and assert the local alert while proving the section heading remains available.

```tsx
const usage: UsageData = {
  usage: { requestCount: 13, inputTokens: 1200, outputTokens: 400, totalCostUsd: 0.12 },
  limits: { maxRequests: 50, maxInputTokens: 500000, maxOutputTokens: 250000, maxCostUsd: 3 },
  tier: "BASIC_PLUS",
  subscriptionStatus: "ACTIVE",
  entitlements: { modelTier: "BASIC_PLUS", sources: [] },
};

expect(await screen.findByText("37 rimasti su 50")).toBeTruthy();
expect(screen.getByText("13 utilizzati")).toBeTruthy();
expect(screen.getByText("Basic Plus")).toBeTruthy();
expect(screen.getByRole("progressbar", { name: "Messaggi utilizzati" }).getAttribute("aria-valuenow")).toBe("13");
expect(screen.getByRole("link", { name: "Vedi i piani" }).getAttribute("href")).toBe("/pricing");
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bunx vitest run 'src/app/(marketing)/profile/components/UsageSection.test.tsx'
```

Expected: failure because `UsageSection` does not exist.

- [ ] **Step 3: Implement `UsageSection`**

Implement a client component that:

```tsx
const tierLabels: Record<UsageTier, string> = {
  GUEST: "Ospite",
  TRIAL: "Prova",
  BASIC: "Basic",
  BASIC_PLUS: "Basic Plus",
  PRO: "Pro",
  ADMIN: "Admin",
};

const used = data.usage.requestCount;
const max = data.limits.maxRequests;
const remaining = Math.max(0, max - used);
const percent = max > 0 ? Math.min((used / max) * 100, 100) : 0;
const canUpgrade = data.tier !== "PRO" && data.tier !== "ADMIN";
```

Fetch `/api/usage` with `{ cache: "no-store" }`, use a stable skeleton, render a local `role="alert"` on failure, update the midnight countdown once per minute, and clean up the interval. Compose existing `Card`, `Button`, and `Progress` primitives using the incumbent profile card tokens.

- [ ] **Step 4: Verify GREEN and edge behavior**

Add a zero-limit fixture asserting a zero-valued progress bar and no invalid percentage. Add a PRO fixture asserting no upgrade CTA. Run the focused test and Biome check on both new files.

- [ ] **Step 5: Commit**

```bash
git add -- 'src/app/(marketing)/profile/components/UsageSection.tsx' 'src/app/(marketing)/profile/components/UsageSection.test.tsx'
git commit -m 'feat(profile): add daily usage section'
```

---

### Task 3: Compose usage into profile

**Files:**
- Create: `src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx`
- Modify: `src/app/(marketing)/profile/[[...rest]]/profile-client.tsx`

**Interfaces:**
- Consumes: `UsageSection` from `../components/UsageSection`.
- Produces: profile content ordered as Clerk profile, usage, preferences, and coaching context.

- [ ] **Step 1: Write the failing composition test**

Render `ProfileClient` with Clerk and Next navigation mocked at their external boundaries. Route fetch calls by URL so the real UsageSection, PreferencesSection, and CoachingContextSection render complete fixtures. Assert that the `#utilizzo` section exists and precedes the heading `Impostazioni` in document order.

- [ ] **Step 2: Verify RED**

Run:

```bash
bunx vitest run 'src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx'
```

Expected: failure because the profile does not yet render `#utilizzo`.

- [ ] **Step 3: Add the section to `ProfileClient`**

Import `UsageSection` and render `<UsageSection />` immediately after the Clerk `UserProfile` container and before `<PreferencesSection />`.

- [ ] **Step 4: Verify GREEN**

Run the profile-client and UsageSection tests together, then Biome-check the three profile files. Expected: all tests pass and the order assertion is green.

- [ ] **Step 5: Commit**

```bash
git add -- 'src/app/(marketing)/profile/[[...rest]]/profile-client.tsx' 'src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx'
git commit -m 'feat(profile): surface usage in settings'
```

---

### Task 4: Remove the obsolete route and retarget internal links

**Files:**
- Modify: `src/lib/rate-limit/upgrade.test.ts`
- Modify: `src/lib/rate-limit/paywall.test.ts`
- Modify: `src/lib/rate-limit/upgrade.ts`
- Modify: `src/app/(chat)/chat/layout-client.test.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Delete: `src/app/(chat)/chat/usage/page.tsx`

**Interfaces:**
- Consumes: `getUpgradeInfo(plan, limitType)` and Next.js filesystem routing.
- Produces: internal usage CTAs target `/profile#utilizzo`; `/chat/usage` is absent from the route map and responds 404.

- [ ] **Step 1: Write the failing link test**

Change the `getUpgradeInfo("GUEST", "general")` expectation to:

```ts
secondaryCta: {
  label: "Controlla utilizzo",
  url: "/profile#utilizzo",
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bunx vitest run src/lib/rate-limit/upgrade.test.ts
```

Expected: failure showing the current `/chat/usage` URL.

- [ ] **Step 3: Retarget links and remove route-specific chrome**

Change `upgrade.ts` to `/profile#utilizzo`. Update the complete paywall fixture and expected `href` to the same destination. Remove `/chat/usage` from the explicit non-conversation condition and its layout test table because an unregistered route no longer reaches chat layout behavior.

- [ ] **Step 4: Delete the route page**

Delete `src/app/(chat)/chat/usage/page.tsx`. Do not create a redirect, rewrite, route handler, or replacement page at that path.

- [ ] **Step 5: Verify focused behavior**

Run:

```bash
bunx vitest run src/lib/rate-limit/upgrade.test.ts src/lib/rate-limit/paywall.test.ts 'src/app/(chat)/chat/layout-client.test.tsx'
rg -n '/chat/usage' src
```

Expected: tests pass and `rg` returns no matches.

- [ ] **Step 6: Verify Next.js and browser behavior**

Use `/_next/mcp` to run `get_compilation_issues`, `get_errors`, and `get_routes`. Verify `/chat/usage` is absent. In the collaborative browser, confirm `/profile#utilizzo` at desktop and 390 px widths, open the sidebar account menu, and confirm the three removed items are absent. Navigate directly to `/chat/usage` and confirm HTTP 404 with no redirect.

- [ ] **Step 7: Final checks and commit**

Run targeted Vitest and Biome checks for every touched implementation/test file, the Impeccable detector once on changed UI targets, and `git diff --check`. Then commit only task-owned files:

```bash
git add -- 'src/lib/rate-limit/upgrade.ts' 'src/lib/rate-limit/upgrade.test.ts' 'src/lib/rate-limit/paywall.test.ts' 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/usage/page.tsx'
git commit -m 'refactor(chat): retire dedicated usage route'
```
