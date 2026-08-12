# 005 — Replace broad and layout transitions

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 7 files, medium

## Problem

`transition-all` remains in shared and high-frequency UI:

```tsx
// src/app/(chat)/components/SuggestedActions.tsx:255
transition-all duration-200

// src/app/(chat)/components/AudioRecorder.tsx:248
transition-all

// src/components/ui/progress.tsx:24
transition-all
```

It also appears in `src/components/ui/tabs.tsx:67` and chat starter cards at
`src/app/(chat)/chat/page.tsx:364`. Usage bars animate width for 500ms at
`src/app/(chat)/chat/usage/page.tsx:119-126`.

## Target

- Suggested/starter cards: explicit background, border, shadow, and transform;
  150–200ms, strong ease-out for transform and `ease` for color.
- Recorder: background-color, color, box-shadow, opacity, transform only; 150ms.
- Progress: transform only, 200ms.
- Tabs: color, background-color, border-color, box-shadow, opacity only; 150ms.
- Usage bars: `w-full origin-left` plus `scaleX(percent / 100)`, 250ms maximum,
  `cubic-bezier(0.77, 0, 0.175, 1)` for discrete movement.

## Repo conventions to follow

- `src/components/ui/button.tsx:8` demonstrates explicit property lists.
- `src/app/(chat)/components/UsageBanner.tsx:307-318` demonstrates scaleX.

## Steps

1. Replace every cited `transition-all` with the exact property subset needed.
2. Convert chat usage width to scaleX and shorten its duration to 250ms.
3. Inspect the admin voice usage bar at
   `src/app/(admin)/admin/voice/page.tsx:161-163`; apply the same pattern.
4. Run `rg 'transition-all|transition: all|transition-\[width\]' src` and remove
   remaining live uses, excluding documented third-party or dead primitives only
   after proving they are not rendered.
5. Add reduced-motion variants that preserve color/opacity feedback.

## Boundaries

- Do NOT change card layout, color design, progress calculations, or data.
- Do NOT animate height, width, margin, padding, top, or left.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `bun run lint`; relevant component tests; `git diff --check`.
- **Feel check**: hover/tap starter suggestions, record audio, switch tabs, and
  refresh usage. DevTools computed styles must show no `all` transitions; paint
  flashing must not highlight progress container layout.
- **Done when**: the live source contains no broad or animated-width transition.
