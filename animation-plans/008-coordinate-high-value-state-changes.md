# 008 — Coordinate high-value state changes

- **Status**: DONE
- **Commit**: 50b230c
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 6 files, large

## Problem

Several spatially stable surfaces replace content in one frame:

- `src/app/(chat)/chat/layout-client.tsx:1270-1298`: desktop sidebar is mounted
  or removed, making main content jump.
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx:1434-1491`: welcome and
  suggestion cards are replaced directly by MessageList.
- `src/app/(chat)/components/RoutineRunner.tsx:265-318`: routine step bodies swap.
- `src/app/(chat)/components/SearchDialog.tsx:133-168`: instruction, empty, and
  results states teleport.
- `RoutineCheckInForm.tsx:158-182` and `RoutineHistory.tsx:121-203` insert
  expanded content abruptly.

## Target

- Sidebar: preserve a stable shell and explain collapse spatially with a 250ms
  `cubic-bezier(0.77, 0, 0.175, 1)` transform/clip reveal. Avoid animated width;
  use grid-template columns only if measurement proves acceptable, otherwise
  overlay/translate the sidebar and reserve/release space discretely at the
  correct transition boundary. Cmd-/ must remain responsive and interruptible.
- Empty chat → conversation: a 150ms opacity crossfade with at most `blur(2px)`;
  no message entrance and no double-exposed interactive controls.
- Routine steps/search/expansions: 150–200ms opacity plus subtle translate no
  greater than 8px; use `AnimatePresence mode="popLayout"` or CSS transitions,
  never `mode="wait"` or height keyframes.
- Reduced motion: opacity-only, 150ms.

## Repo conventions to follow

- Exact ease-out: `cubic-bezier(0.23, 1, 0.32, 1)`.
- On-screen movement: `cubic-bezier(0.77, 0, 0.175, 1)`.
- Existing keyed `AnimatePresence initial={false} mode="popLayout"` appears in
  `src/app/(chat)/components/ChatInput.tsx:323`.

## Steps

1. Implement and browser-verify the desktop sidebar independently. Keep the
   mobile Sheet unchanged. Spam Cmd-/ to prove interruption; preserve focus and
   toast alignment data attributes.
2. Key the empty/conversation states in ChatConversationClient and crossfade
   them without delaying the first user message or assistant pending state.
3. Key RoutineRunner bodies by completed/current step identity. Do not animate
   the timer every tick; animate only actual step changes.
4. Key SearchDialog result-body states (`instruction`, `loading`, `empty`,
   `results`) and reserve a sensible minimum block height so result arrival does
   not jerk the dialog.
5. Add restrained expansion continuity to RoutineCheckInForm and RoutineHistory,
   using clip-path or transform/opacity rather than height animation.
6. Add reduced-motion branches and focused behavior tests for state identity.

## Boundaries

- Do NOT change mobile sidebar behavior, navigation, search debounce, routine
  state, focus management, or chat streaming.
- Do NOT animate live timer ticks or message reconciliation.
- Do NOT exceed `blur(2px)`, 200ms for small state swaps, or 300ms for sidebar.
- Do NOT add dependencies.

## Verification

- **Mechanical**: targeted layout-client, chat-conversation, routine, and search
  tests; `bun run lint`; `bun run typecheck`.
- **Feel check**: record desktop and 390x844 sessions. At 10% playback confirm:
  sidebar reverses without jumps; first message appears immediately while the
  welcome clears; routine/search bodies never double-expose controls; expansions
  originate beside their trigger.
- Toggle reduced motion and confirm movement is removed while opacity remains.
- **Done when**: all six state seams have continuity without adding input delay.
