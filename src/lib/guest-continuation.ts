const CHAT_PATH = /^\/chat(?:\/[^/?#\\]+)?$/;

export function getSafeGuestContinuation(
  value: string | string[] | undefined,
): string {
  if (typeof value !== "string") {
    return "/chat";
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/chat";
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    !CHAT_PATH.test(decoded)
  ) {
    return "/chat";
  }

  return decoded;
}
