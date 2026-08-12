# 002 — Make search and popup motion interruptible

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 6 shared primitive files, medium

## Problem

The Cmd-K search dialog and message-action dropdown use `tw-animate-css`
keyframes. Reversing them mid-flight restarts animation rather than retargeting
from the current visual state.

```tsx
// src/components/ui/dialog.tsx:41,63 — current
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
```

```tsx
// src/components/ui/dropdown-menu.tsx:45 — current
data-[state=closed]:animate-out ... data-[state=open]:animate-in
```

The same pattern exists in `select.tsx`, `popover.tsx`, and `tooltip.tsx`.

## Target

Use CSS transitions driven by Radix `data-state`, never entry/exit keyframes:

```css
transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1),
  opacity 150ms cubic-bezier(0.23, 1, 0.32, 1);
```

Trigger-anchored content starts at `scale(0.95)` plus a subtle side translation,
using the existing Radix transform-origin variables. Dialog content uses center
origin and `scale(0.95)`. Closed elements must remain mounted long enough for
Radix exit transitions to complete; use the supported Radix state lifecycle,
not timers.

## Repo conventions to follow

- `src/components/ui/sheet.tsx:39-65` is the interruptible transition exemplar.
- Exact ease-out: `cubic-bezier(0.23, 1, 0.32, 1)`.
- Preserve `origin-(--radix-*-content-transform-origin)` already present.

## Steps

1. Replace keyframe classes in `dialog.tsx` overlay and content with opacity and
   transform transitions keyed by `data-[state=open]` and closed defaults.
2. Apply the same transition model to dropdown menu content and sub-content,
   select, popover, and tooltip.
3. Preserve the current side-specific direction with 0.5rem or less of
   translation and `scale(0.95)`; never use `scale(0)`.
4. Add `duration-150` for tooltips/dropdowns and `duration-200` for dialogs.
5. Add or update primitive tests if present; exercise SearchDialog and message
   dropdown behavior in the browser.

## Boundaries

- Do NOT alter focus management, portals, collision detection, or z-index.
- Do NOT change modal center origin.
- Do NOT replace Radix components or add timers/dependencies.

## Verification

- **Mechanical**: `bun run lint`; relevant dialog/dropdown tests; `git diff --check`.
- **Feel check**: press Cmd-K then Escape repeatedly and rapidly open/close the
  message actions menu. At 10% playback, every reversal must continue from its
  current opacity/scale instead of jumping to an endpoint.
- Toggle reduced motion after plan 006: movement disappears but opacity remains.
- **Done when**: all shared popup primitives are keyframe-free and reversible.
