const DEFAULT_TERMS_URL = "https://anthon.ai/terms";
const DEFAULT_PRIVACY_URL = "https://anthon.ai/privacy";

export function resolveLegalUrl(
  value: string | undefined,
  fallback: string,
  environment = process.env.NODE_ENV,
): string {
  const candidate = value?.trim() || fallback;

  try {
    const url = new URL(candidate);
    const isLocalDevelopment =
      environment !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (url.protocol !== "https:" && !isLocalDevelopment) {
      return fallback;
    }

    return url.toString();
  } catch {
    return fallback;
  }
}

export const LEGAL_LINKS = {
  terms: resolveLegalUrl(process.env.NEXT_PUBLIC_TERMS_URL, DEFAULT_TERMS_URL),
  privacy: resolveLegalUrl(
    process.env.NEXT_PUBLIC_PRIVACY_URL,
    DEFAULT_PRIVACY_URL,
  ),
} as const;

export { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL };
