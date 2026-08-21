export type BetaGatePathKind = "public" | "page" | "api";

const PUBLIC_PATH_PREFIXES = [
  "/beta-access",
  "/privacy",
  "/terms",
  "/admin",
  "/api/admin",
  "/api/beta-access",
  "/api/health",
  "/api/webhooks",
  "/api/cron",
  "/api/queues",
] as const;

const ADMIN_AUTH_PATH_PREFIXES = [
  "/sign-in",
  "/forgot-password",
  "/auth-continue",
  "/sso-callback",
  "/session-tasks",
] as const;

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyBetaGatePath(pathname: string): BetaGatePathKind {
  if (
    PUBLIC_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
  ) {
    return "public";
  }
  return matchesPathPrefix(pathname, "/api") ? "api" : "page";
}

export function isAdminPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, "/admin");
}

export function isAdminAuthBootstrapRequest(url: URL): boolean {
  if (
    !ADMIN_AUTH_PATH_PREFIXES.some((prefix) =>
      matchesPathPrefix(url.pathname, prefix),
    )
  ) {
    return false;
  }

  const destination =
    url.searchParams.get("redirect_url") ??
    url.searchParams.get("redirectUrl") ??
    url.searchParams.get("returnTo");
  if (!destination || destination.startsWith("//")) return false;

  try {
    const parsed = new URL(destination, url.origin);
    return parsed.origin === url.origin && isAdminPath(parsed.pathname);
  } catch {
    return false;
  }
}
