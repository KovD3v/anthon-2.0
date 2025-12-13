## 2024-05-23 - Icon-only Buttons Accessibility
**Learning:** In chat interfaces, responsive design often hides text labels (e.g., "Export" becoming just an icon), turning standard buttons into icon-only buttons that become inaccessible to screen readers without explicit `aria-label`s.
**Action:** Always check `hidden sm:inline` or similar responsive utility classes on button text; if text disappears, the parent button MUST have an `aria-label`.
