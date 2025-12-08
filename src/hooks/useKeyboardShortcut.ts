import { useEffect } from "react";

type KeyModifier = "ctrl" | "meta" | "alt" | "shift";

interface ShortcutOptions {
  key: string;
  modifiers?: KeyModifier[];
  callback: () => void;
  enabled?: boolean;
}

/**
 * Hook to register global keyboard shortcuts.
 * Handles modifier keys (Ctrl/Cmd, Alt, Shift) and prevents default behavior.
 */
export function useKeyboardShortcut({
  key,
  modifiers = [],
  callback,
  enabled = true,
}: ShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Check if the key matches (case-insensitive)
      if (event.key.toLowerCase() !== key.toLowerCase()) return;

      // Check all required modifiers
      const hasCtrl = modifiers.includes("ctrl");
      const hasMeta = modifiers.includes("meta");
      const hasAlt = modifiers.includes("alt");
      const hasShift = modifiers.includes("shift");

      // For cross-platform support, treat ctrl/meta as equivalent
      const needsCmdOrCtrl = hasCtrl || hasMeta;
      const hasCmdOrCtrl = event.ctrlKey || event.metaKey;

      if (needsCmdOrCtrl && !hasCmdOrCtrl) return;
      if (hasAlt && !event.altKey) return;
      if (hasShift && !event.shiftKey) return;

      // Prevent triggering when typing in inputs
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Allow Escape in inputs, block other shortcuts
      if (isInput && key.toLowerCase() !== "escape") return;

      event.preventDefault();
      callback();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, modifiers, callback, enabled]);
}
