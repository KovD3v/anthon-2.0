export function isFastPathEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env.AI_FAST_PATH_ENABLED?.trim().toLowerCase();
  return value === undefined || value === "true";
}
