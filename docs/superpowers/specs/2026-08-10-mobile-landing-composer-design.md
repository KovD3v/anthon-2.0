# Mobile Landing Composer Design

## Goal

On the mobile chat landing page, keep the writing bar immediately available and reduce the starter situations so they fit in a compact two-column grid.

## Context

The `/chat` landing page currently renders the welcome content, three starter situations, and a free-conversation button inside one vertically scrollable region. It does not render the shared `ChatInput`; the writing bar only appears after a conversation is created. On a short mobile viewport, the tall single-column starter cards push the available next action below the fold.

## Decision

- Keep the existing three starter situations and their behavior; do not invent a fourth prompt just to fill the grid.
- Render the existing `ChatInput` below a scrollable landing-content region so the composer remains visible while the welcome content can scroll independently.
- Submit typed landing text through `createChat({ initialMessage })`, preserving the existing pending-initial-message flow used by conversation creation.
- Match conversation behavior for attachments: guests cannot attach files, while authenticated users retain the existing attachment controls.
- Use two columns at mobile widths and smaller mobile card spacing, icon, typography, and minimum height. Keep the current three-column desktop layout and larger desktop sizing.
- Disable the landing composer while chat creation is in flight and show the existing shared disabled-state affordance.

## Verification

- Add a landing-page regression test proving the composer is present and submits its text as the initial message.
- Run the focused landing-page test, Biome on changed files, `git diff --check`, and the full unit test command.
- Verify the real `/chat` route at a mobile viewport when the local dev server is usable, checking that the textbox is in the initial viewport and the starter buttons use two columns.
