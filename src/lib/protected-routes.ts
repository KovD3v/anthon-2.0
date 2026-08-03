const PROTECTED_ROUTE_PREFIXES = [
  "/profile",
  "/settings",
  "/admin",
  "/channels",
  "/organization",
  "/organizzation",
] as const;

/**
 * Returns whether a pathname belongs to a protected route subtree.
 *
 * This is used only for the early signed-out redirect in the proxy. Actual
 * authentication and authorization still belongs in the server resource.
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
