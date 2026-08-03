const DEFAULT_AUTH_CONTINUATION = "/chat";

const ALLOWED_PATHS = [
  /^\/chat(?:\/.*)?$/,
  /^\/profile$/,
  /^\/settings$/,
  /^\/admin$/,
  /^\/channels$/,
  /^\/organization$/,
  /^\/link\/(?:telegram|whatsapp)\/[^/?#]+$/,
];

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function getSafeAuthContinuation(
  value: string | string[] | null | undefined,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_AUTH_CONTINUATION;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return DEFAULT_AUTH_CONTINUATION;
  }

  try {
    const url = new URL(value, "https://anthon.local");
    const decodedPathname = decodeURIComponent(url.pathname);

    if (
      url.origin !== "https://anthon.local" ||
      url.hash ||
      !decodedPathname.startsWith("/") ||
      decodedPathname.startsWith("//") ||
      decodedPathname.includes("\\") ||
      !ALLOWED_PATHS.some((pattern) => pattern.test(decodedPathname))
    ) {
      return DEFAULT_AUTH_CONTINUATION;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_AUTH_CONTINUATION;
  }
}

export { DEFAULT_AUTH_CONTINUATION };
