# 006 — Respect reduced motion and pointer capability

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 9 files, medium

## Problem

Shared popups always slide/zoom, SuggestedActions always applies positional
stagger, and hover transforms are unconditional on several cards.

```tsx
// src/app/(chat)/components/SuggestedActions.tsx:154-187
variants={staggerContainer(0.05)}
// children use fadeUp: translateY(12px)
```

```tsx
// src/app/(chat)/chat/page.tsx:364
hover:-translate-y-1
```

Marketing Features and HowItWorks also use unconditional Framer `whileHover`
plus group rotate/scale.

## Target

- Reduced motion keeps 150–200ms opacity/color feedback but removes translate,
  rotate, and scale.
- CSS hover transforms exist only under `(hover: hover) and (pointer: fine)` and
  `(prefers-reduced-motion: no-preference)`.
- Framer consumers use `useReducedMotion()` or `MotionConfig reducedMotion="user"`
  and branch transform values to identity.

## Repo conventions to follow

- `src/app/(chat)/components/AudioPlayer.tsx:200` shows the exact Tailwind
  arbitrary media-query pattern.
- `src/app/(chat)/components/MessageList.tsx:275` shows `useReducedMotion()`.
- Preserve the component-level strategy documented in `globals.css:264-265`.

## Steps

1. After plan 002, add reduced-motion identity transforms and opacity-only
   transitions to dialog, dropdown, select, tooltip, and popover.
2. Add `useReducedMotion()` to SuggestedActions and replace child transforms
   with opacity-only variants when true; do not remove informative color states.
3. Gate landing starter-card translate and send-button scale with the exact fine
   pointer/no-preference media query.
4. In Features and HowItWorks, branch `whileHover` to identity under reduced
   motion and gate CSS group rotate/scale to fine pointers.
5. Ensure press feedback remains disabled under reduced motion while color and
   opacity remain available.
6. Add tests for reduced-motion branch values where existing mocks support it.

## Boundaries

- Do NOT globally set animation duration to near-zero.
- Do NOT suppress spinners that communicate indeterminate loading unless an
  equivalent non-motion indicator remains.
- Do NOT change visual layout or content.

## Verification

- **Mechanical**: `bun run lint`; targeted ChatList/MessageList/component tests.
- **Feel check**: emulate reduced motion and coarse pointer. Popups must fade
  without movement; cards must not lift/rotate/scale; color, focus, loading, and
  opacity feedback must remain clear.
- **Done when**: no user-preference or touch path receives decorative movement.
