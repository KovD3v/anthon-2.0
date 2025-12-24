## 2024-05-22 - Accessibility & Localization
**Learning:** The application has mixed localization (English primary, Italian for AudioRecorder). When adding accessibility features like `aria-label`, it is crucial to match the component's existing language to avoid confusing users.
**Action:** Always check the visible text (or `title`) of a component before adding `aria-label`. If it's Italian, the `aria-label` must be Italian.
