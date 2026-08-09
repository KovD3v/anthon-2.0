export const CAPABILITY_USAGE_VALUES = [
  "rag",
  "web",
  "memory",
  "routine",
  "voice",
] as const;

export type CapabilityUsage = (typeof CAPABILITY_USAGE_VALUES)[number];

export type CapabilityUsageData = {
  capabilities: CapabilityUsage[];
};

export function normalizeCapabilityUsage(value: unknown): CapabilityUsage[] {
  if (!Array.isArray(value)) return [];

  const requested = new Set(value);
  return CAPABILITY_USAGE_VALUES.filter((capability) =>
    requested.has(capability),
  );
}
