const EXACT_STABLE_MEMORY_KEY = /^[a-z][a-z0-9_]{0,127}$/;

export function isExactStableMemoryKey(target: unknown): target is string {
  return typeof target === "string" && EXACT_STABLE_MEMORY_KEY.test(target);
}
