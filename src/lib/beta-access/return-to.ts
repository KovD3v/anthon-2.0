import { classifyBetaGatePath } from "./route-policy";

const INTERNAL_ORIGIN = "https://anthon.internal";

export function sanitizeBetaReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (
      parsed.origin !== INTERNAL_ORIGIN ||
      classifyBetaGatePath(parsed.pathname) !== "page"
    ) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
