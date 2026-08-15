import type { CapabilityDecision } from "./capability-arbitration";

export const CAPABILITY_USAGE_VALUES = [
  "rag",
  "web",
  "memory",
  "recall",
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

/**
 * Generation finishes before asynchronous audio delivery. Voice therefore
 * cannot be attributed at this boundary even when it was selected or queued.
 */
export function normalizePreDeliveryCapabilityUsage(
  value: unknown,
): CapabilityUsage[] {
  return normalizeCapabilityUsage(value).filter(
    (capability) => capability !== "voice",
  );
}

export function filterCapabilityUsageByDecision(
  value: unknown,
  decision: CapabilityDecision | undefined,
  plannerMode: "legacy" | "agentic",
  modelSelectsTools = false,
): CapabilityUsage[] {
  const capabilities = normalizeCapabilityUsage(value);
  if (!decision || plannerMode === "legacy" || modelSelectsTools) {
    return capabilities;
  }

  return capabilities.filter((capability) => {
    switch (capability) {
      case "rag":
        return decision.rag;
      case "web":
        return decision.webSearch || decision.webFetch;
      case "memory":
        return (
          decision.memoryRead || decision.memoryWrite || decision.memoryDelete
        );
      case "recall":
        return true;
      case "routine":
        return decision.routineProposal;
      case "voice":
        return decision.voiceOutput;
    }
    return false;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function appendDeliveredCapabilityToMetadata(
  value: unknown,
  capability: CapabilityUsage,
  parts?: unknown,
): Record<string, unknown> {
  const metadata = isRecord(value) ? value : {};
  const ai = isRecord(metadata.ai) ? metadata.ai : {};
  const partCapabilities = Array.isArray(parts)
    ? parts.flatMap((part) => {
        if (!isRecord(part) || part.type !== "data-aiCapabilities") return [];
        const data = isRecord(part.data) ? part.data : undefined;
        return Array.isArray(data?.capabilities) ? data.capabilities : [];
      })
    : [];

  return {
    ...metadata,
    ai: {
      ...ai,
      capabilitiesUsed: normalizeCapabilityUsage([
        ...normalizeCapabilityUsage(ai.capabilitiesUsed),
        ...partCapabilities,
        capability,
      ]),
    },
  };
}

export function appendDeliveredCapabilityToParts(
  value: unknown,
  capability: CapabilityUsage,
): unknown[] {
  const parts = Array.isArray(value) ? value : [];
  const capabilities: unknown[] = [];
  let firstCapabilityPartIndex = -1;

  for (const [index, part] of parts.entries()) {
    if (!isRecord(part) || part.type !== "data-aiCapabilities") continue;

    if (firstCapabilityPartIndex === -1) firstCapabilityPartIndex = index;
    const data = isRecord(part.data) ? part.data : undefined;
    if (Array.isArray(data?.capabilities)) {
      capabilities.push(...data.capabilities);
    }
  }

  const capabilityPart = {
    type: "data-aiCapabilities",
    data: {
      capabilities: normalizeCapabilityUsage([...capabilities, capability]),
    },
  };

  if (firstCapabilityPartIndex === -1) {
    return [...parts, capabilityPart];
  }

  const result: unknown[] = [];
  for (const [index, part] of parts.entries()) {
    if (isRecord(part) && part.type === "data-aiCapabilities") {
      if (index === firstCapabilityPartIndex) result.push(capabilityPart);
      continue;
    }
    result.push(part);
  }
  return result;
}
