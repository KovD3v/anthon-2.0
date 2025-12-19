## 2025-05-18 - Accessibility on Icon-Only Buttons
**Learning:** Icon-only buttons (like Send, Stop, Attach) are common in chat interfaces but often lack `aria-label`, making them inaccessible to screen readers.
**Action:** Always check `aria-label` when using icon-only buttons, especially in dynamic components like `ChatInput`.
