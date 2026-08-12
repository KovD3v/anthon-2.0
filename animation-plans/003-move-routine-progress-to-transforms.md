# 003 — Move routine progress to compositor transforms

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files, small

## Problem

`RoutineRunner` updates time every 250ms and retargets two animated widths.

```tsx
// src/app/(chat)/components/RoutineRunner.tsx:92,258-261 — current
const intervalId = window.setInterval(() => setNow(Date.now()), 250);
<div
  className="h-full rounded-full bg-primary transition-[width] duration-200"
  style={{ width: `${progress.routinePercent}%` }}
/>
```

The step bar repeats the same pattern at lines 294-297. Animated width causes
continuous layout and paint during timed routines.

## Target

```tsx
className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-200 ease-linear motion-reduce:transition-none"
style={{ transform: `scaleX(${progress.routinePercent / 100})` }}
```

Apply the same target to `stepPercent`. Clamp scale to `[0, 1]`.

## Repo conventions to follow

- `src/app/(chat)/components/UsageBanner.tsx:307-318` is the existing `scaleX`
  implementation.
- `origin-left` is required so progress advances left-to-right.

## Steps

1. Replace width mutation for routine and step progress with `w-full`,
   `origin-left`, and inline `transform: scaleX(...)`.
2. Use a linear 200ms transition because values advance continuously.
3. Keep `motion-reduce:transition-none` and every ARIA progress value unchanged.
4. Extend `RoutineRunner.test.tsx` to reject `transition-[width]` and assert
   scale transforms for representative percentages.

## Boundaries

- Do NOT change the 250ms clock, routine state machine, timing math, or ARIA.
- Do NOT animate container dimensions.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `bunx vitest run src/app/\(chat\)/components/RoutineRunner.test.tsx`; `bun run lint`.
- **Feel check**: run a timer and breathing routine with Performance paint
  flashing enabled. The fill must advance smoothly without repainting layout.
- With reduced motion, progress may step discretely but must remain accurate.
- **Done when**: no routine progress element animates width.
