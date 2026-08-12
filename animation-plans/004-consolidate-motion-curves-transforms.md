# 004 — Consolidate motion curves and transforms

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 6 files, medium

## Problem

`src/lib/motion.ts` claims to be the single source of truth but exposes weak
curves and main-thread Framer shorthands:

```ts
// current
out: [0.0, 0.0, 0.2, 1],
inOut: [0.4, 0.0, 0.2, 1],
hidden: { opacity: 0, y: 12 },
hidden: { opacity: 0, scale: 0.95 },
```

ChatList, SidebarBottom, and ChatInput repeatedly inline
`[0.23, 1, 0.32, 1]`; MessageList also uses built-in `"easeOut"`.

## Target

```ts
export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const;

hidden: { opacity: 0, transform: "translateY(12px)" }
show: { opacity: 1, transform: "translateY(0)" }

hidden: { opacity: 0, transform: "scale(0.95)" }
show: { opacity: 1, transform: "scale(1)" }
```

Keep `duration.fast=0.15`, `base=0.25`, and `slow=0.4`.

## Repo conventions to follow

- Button and Sheet already use the exact target curves in
  `src/components/ui/button.tsx:8` and `sheet.tsx:39-65`.
- Use full transform strings for Framer motion.

## Steps

1. Update `src/lib/motion.ts` with the exact curves and transform strings above.
2. Remove the unused `ease.in` token unless a verified consumer needs it; exits
   use strong ease-out under this motion system.
3. Replace inline curves/durations in ChatList, SidebarBottom, ChatInput, and
   MessageList with imports from `@/lib/motion`.
4. Search the entire source tree for duplicated `[0.23, 1, 0.32, 1]`, built-in
   `easeOut`, and Framer `x`/`y`/`scale` shorthands; migrate motion-system
   consumers without changing unrelated chart APIs.
5. Update tests that assert current motion literals.

## Boundaries

- Do NOT change animation purpose or add motion to static elements.
- Do NOT alter duration budgets beyond the listed tokens.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `bun run lint`; `bun run typecheck`; targeted chat tests.
- **Feel check**: inspect welcome, suggestions, sidebar actions, and account menu
  at 10% speed. Entrances must begin immediately and settle cleanly without
  inconsistent curves.
- **Done when**: shared consumers contain no inline duplicate curves and shared
  variants use full transform strings.
