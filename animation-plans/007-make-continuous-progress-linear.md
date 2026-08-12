# 007 — Make continuous progress linear

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, small

## Problem

Audio playback is constant motion, but every `timeupdate` target is eased:

```tsx
// src/app/(chat)/components/AudioPlayer.tsx:257-260 — current
className="h-full origin-left rounded-full transition-transform duration-100 ease-out"
style={{ transform: `scaleX(${progress / 100})` }}
```

Repeated ease-out acceleration/deceleration makes the fill pulse rather than
advance uniformly.

## Target

Use `transition-transform duration-100 ease-linear`, retaining scaleX and
origin-left. When the user seeks, immediate accuracy takes priority: either
disable the transition for that update or keep 100ms only if the thumb and fill
remain synchronized.

## Repo conventions to follow

- Constant progress uses CSS `linear` per the animation audit catalog.
- Keep the existing compositor transform implementation.

## Steps

1. Replace `ease-out` with `ease-linear` on the active progress fill.
2. Verify keyboard and pointer seeking keep the fill and scrub handle aligned.
3. Add a focused assertion to the AudioPlayer test if one exists; otherwise add
   a small render test for the timing class.

## Boundaries

- Do NOT change audio event cadence, playback logic, or scrub calculations.
- Do NOT animate the handle with layout properties.
- Do NOT add dependencies.

## Verification

- **Mechanical**: targeted AudioPlayer test; `bun run lint`.
- **Feel check**: play a two-minute clip and inspect at 10% speed. Progress must
  move evenly between events; click and arrow seeking must land accurately.
- **Done when**: continuous progress uses linear timing without seek lag.
