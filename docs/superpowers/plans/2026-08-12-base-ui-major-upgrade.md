# Base UI and UI-stack Major Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Radix with shadcn Base Luma/Base UI, update the UI and motion stack through compatible majors, and remove confirmed dead UI dependencies without changing Anthon's product behavior or visual identity.

**Architecture:** Keep `src/components/ui/*` as the application-facing compatibility boundary. Rebuild primitive internals on `@base-ui/react`, translate Base UI state and positioning attributes into Anthon's existing classes and motion contract, and update only consumers whose Radix composition props cannot be safely retained.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Bun, shadcn `base-luma`, Base UI, Tailwind CSS 4, Framer Motion, Lucide, Recharts, Sonner, Vitest, Testing Library.

## Global Constraints

- Preserve Anthon's semantic tokens, component export names, dimensions, variants, focus treatment, dark mode, Italian copy, responsive behavior, and motion timing.
- Do not introduce another animation system or weaken reduced-motion behavior.
- Remove all production imports and dependencies from `radix-ui` and `@radix-ui/*`.
- Keep backend-only major dependencies, TypeScript, PDF parsing, jsdom, and Knip out of scope.
- Use Base UI's supported event and positioning APIs; do not emulate Radix internals with DOM workarounds.
- Preserve unrelated work and commit only after fresh verification.

---

### Task 1: Lock the migration contract and dependency boundary

**Files:**
- Create: `src/components/ui/base-ui-migration.test.ts`
- Modify: `components.json`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the approved design spec and current `src/components/ui/*` exports.
- Produces: Base Luma configuration and one Base UI dependency version shared by every migrated wrapper.

- [ ] **Step 1: Write the failing repository-policy test**

Add a Vitest test that reads `components.json`, `package.json`, and active UI wrapper sources. Assert literal `style === "base-luma"`, `@base-ui/react` is present, Radix dependencies are absent, and no active UI source imports `radix-ui` or `@radix-ui/*`. This test catches a mixed primitive stack, which is prohibited by the migration contract.

- [ ] **Step 2: Run the test and verify RED**

Run: `bunx vitest run src/components/ui/base-ui-migration.test.ts`

Expected: FAIL because the current style is `new-york`, Base UI is absent, and Radix imports remain.

- [ ] **Step 3: Switch configuration and dependencies**

Set `components.json#style` to `base-luma`. Add current compatible releases of `@base-ui/react`, `framer-motion`, `lucide-react`, `cnfast`, `tailwindcss`, `@tailwindcss/postcss`, `recharts`, and `sonner`. Remove `radix-ui`, every direct `@radix-ui/react-*` package, `tw-animate-css`, and `@tanstack/react-virtual`. Remove the `tw-animate-css` import from `globals.css` while retaining Anthon's local accordion keyframes.

- [ ] **Step 4: Install and record the resolved graph**

Run `bun install`, then `bun pm ls --all` filtered for Base UI, Radix, Motion, Lucide, Tailwind, Recharts, Sonner, and cnfast. Confirm there is one intended direct primitive dependency and no direct Radix dependency.

- [ ] **Step 5: Commit the dependency boundary with the completed wrapper migration**

Do not commit an uncompilable intermediate state. Stage this task together with Tasks 2 and 3 after their focused tests pass.

### Task 2: Migrate composition and form primitives

**Files:**
- Create: `src/components/ui/primitives.test.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/label.tsx`
- Modify: `src/components/ui/separator.tsx`
- Modify: `src/components/ui/progress.tsx`
- Modify: `src/components/ui/checkbox.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/ui/slider.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/accordion.tsx`
- Modify: `src/components/ui/scroll-area.tsx`

**Interfaces:**
- Consumes: `@base-ui/react` 1.x primitives and the existing named exports.
- Produces: the same local component names and Anthon variant APIs, backed only by Base UI.

- [ ] **Step 1: Add behavior baselines before replacement**

Use real components with Testing Library. Cover Button rendering through `asChild`, checkbox and switch state callbacks, slider value callback, tab keyboard selection, and accordion expansion. Assertions target roles, checked/selected/expanded states, link semantics, and callback values rather than implementation markup.

- [ ] **Step 2: Run the focused baseline against Radix**

Run: `bunx vitest run src/components/ui/primitives.test.tsx`

Expected: PASS, recording behavior that the Base UI implementation must preserve.

- [ ] **Step 3: Replace primitive internals**

Use the current Base Luma registry sources as the API reference. Keep Anthon's classes and variants, translate state selectors to Base UI (`data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-active`, `data-horizontal`, `data-vertical`), and use Base UI's `Control`, `Indicator`, `Panel`, `Tab`, and viewport parts where required. Preserve Button and Badge `asChild` compatibility through Base UI's supported `render`/`useRender` composition API.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bunx vitest run src/components/ui/primitives.test.tsx src/lib/motion-contract.test.ts`

Run: `bun run typecheck`

Expected: PASS with no Radix-derived types.

### Task 3: Migrate overlays, floating UI, and affected consumers

**Files:**
- Create: `src/components/ui/overlays.test.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/alert-dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/popover.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/confirm-dialog.tsx`
- Modify: affected consumers returned by `rg "asChild|onSelect" src` after typechecking.

**Interfaces:**
- Consumes: existing local wrapper names, Base UI `Backdrop`, `Popup`, `Positioner`, `Portal`, `Close`, and Menu/Select event APIs.
- Produces: focus-managed, keyboard-accessible overlays with the same application-facing behavior.

- [ ] **Step 1: Add overlay behavior baselines**

Use real wrappers to cover opening and closing a dialog, Escape dismissal, focus restoration, non-dismissible alert-dialog outside interaction, sheet close, menu keyboard selection, select value changes, and tooltip accessible content. Prefer `userEvent` and observable roles/states.

- [ ] **Step 2: Run the focused baseline against Radix**

Run: `bunx vitest run src/components/ui/overlays.test.tsx`

Expected: PASS, recording the current user-visible contracts.

- [ ] **Step 3: Replace overlay internals**

Use Base UI `Backdrop`/`Popup` for dialogs, `Positioner`/`Popup` for anchored content, and Base UI Menu for dropdowns. Translate Radix positioning variables to Base UI `--available-height`, `--anchor-width`, and `--transform-origin`. Retain Anthon's explicit opacity/transform transitions and reduced-motion branches instead of importing Base Luma's broad `transition-all` or restartable animation utilities.

- [ ] **Step 4: Adapt composition call sites**

Where Base UI cannot preserve a Radix `asChild` or `onSelect` signature safely, switch the internal consumer to Base UI's `render` or click/event API without changing the rendered role, label, navigation, or action. Keep Button's public `asChild` compatibility because it has widespread callers.

- [ ] **Step 5: Run overlay tests, consumer tests, and typecheck**

Run: `bunx vitest run src/components/ui/overlays.test.tsx src/app/\(chat\)/components/MessageList.behavior.test.tsx src/app/\(chat\)/chat/layout-client.test.tsx`

Run: `bun run typecheck`

Expected: PASS with correct focus and callbacks.

### Task 4: Complete cleanup and static verification

**Files:**
- Delete: `src/app/(chat)/components/hooks/useMessageVirtualizer.ts`
- Modify: any source files required by major-version type changes.
- Modify: `src/components/ui/base-ui-migration.test.ts`

**Interfaces:**
- Consumes: the fully migrated Base UI source tree.
- Produces: a dependency-clean and type-clean UI stack.

- [ ] **Step 1: Confirm dead source before deletion**

Run `rg "useMessageVirtualizer|@tanstack/react-virtual" src package.json`. The only source match must be the dead hook itself before deleting it with a patch.

- [ ] **Step 2: Resolve major-version compatibility errors narrowly**

Run typecheck and targeted tests. Update Motion, Lucide, Recharts, Sonner, or cnfast call sites only where their current major APIs require it. Do not refactor unrelated application logic.

- [ ] **Step 3: Run the migration policy test GREEN**

Run: `bunx vitest run src/components/ui/base-ui-migration.test.ts`

Expected: PASS: Base Luma configured, Base UI present, Radix absent from direct dependencies and production UI imports.

- [ ] **Step 4: Run static cleanup checks**

Run: `rg "from [\\\"'](?:radix-ui|@radix-ui/)" src package.json`

Expected: no matches.

Run: `bun run knip`

Expected: no unused dependency/file finding introduced by this migration; pre-existing unrelated export findings may remain and must be reported without widening scope.

### Task 5: Full verification, runtime inspection, and delivery

**Files:**
- Modify only files required to fix defects demonstrated by these gates.

**Interfaces:**
- Consumes: the complete migration.
- Produces: fresh evidence for release and a conventional implementation commit.

- [ ] **Step 1: Run code-quality and test gates**

Run: `bun run lint`

Run: `bun run typecheck`

Run: `bun run test`

Run: `git diff --check`

Expected: all exit 0.

- [ ] **Step 2: Run the production build**

Run: `bun run build`

Expected: Prisma generation and Next.js build exit 0. If an external database or platform dependency blocks the build, record the exact external failure and run the closest artifact-only Next build gate permitted by the repository.

- [ ] **Step 3: Run the Impeccable detector once**

Run the detector over the changed UI wrapper and consumer files. Vet findings against the preserved Anthon design; fix only migration regressions.

- [ ] **Step 4: Verify the running application**

With `next dev` running, use `next-dev-loop`: inspect Next diagnostics and verify desktop/mobile chat, account/sidebar menu, dialog/sheet, marketing navigation, profile switches, admin menu/form controls, toast placement, charts, keyboard focus, Escape dismissal, and reduced motion. Perform one batched desktop/mobile pass, fix demonstrated migration defects, then at most one confirmation pass.

- [ ] **Step 5: Re-run affected gates after runtime fixes**

Re-run lint, typecheck, targeted tests, full unit tests, build where applicable, migration policy, and `git diff --check` after the final code edit.

- [ ] **Step 6: Commit**

Stage only migration files and commit with `refactor(ui): migrate shadcn primitives to Base UI`. Confirm the worktree is clean and report exact verification evidence.
