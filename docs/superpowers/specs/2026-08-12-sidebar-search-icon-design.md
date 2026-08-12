# Sidebar Search Icon Design

## Goal

Make conversation search a compact header action instead of a secondary full-width action beneath “Nuova Chat”.

## Design

- Add a 32 by 32 pixel ghost icon button to `SidebarHeader`, immediately to the left of the sidebar collapse control.
- Use the existing Lucide `Search` icon and the accessible label “Cerca nelle conversazioni”.
- Render the action only when search is available, preserving the current guest behavior.
- Remove the full-width “Cerca conversazioni” button and its shortcut badge from `ChatList`.
- Keep the existing search dialog, `Cmd+K` shortcut, focus restoration, desktop behavior, and mobile sheet behavior unchanged.

## Component Contract

`SidebarHeader` accepts an optional `onSearch` callback alongside `onCollapse`. `SidebarContents` passes its existing optional search callback to the header and no longer passes it to `ChatList`.

## Verification

- Component coverage confirms the icon action is present only when search is enabled and invokes the callback.
- Existing layout search and mobile focus-restoration coverage remains green.
- Runtime verification checks the lens is next to the sidebar toggle, the old row is absent, and the lens opens the existing dialog on desktop and mobile.
