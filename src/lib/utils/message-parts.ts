/**
 * Extracts plain text from an AI SDK v5 `parts` array.
 * Returns the text of the first `{type: "text"}` part, or "" if none found.
 *
 * Parts format: Array<{type: string; text?: string; ...}>
 */
export function getTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  for (const part of parts) {
    if (
      part !== null &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type: string }).type === "text" &&
      "text" in part
    ) {
      return String((part as { text: unknown }).text ?? "");
    }
  }
  return "";
}
