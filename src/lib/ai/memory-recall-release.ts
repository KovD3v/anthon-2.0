export type MemoryRecallMode = "off" | "shadow" | "active";
export type MemoryRecallDecision = Readonly<{
  mode: MemoryRecallMode;
  reason: string;
}>;

function decision(mode: MemoryRecallMode, reason: string): MemoryRecallDecision {
  return Object.freeze({ mode, reason });
}

export async function resolveMemoryRecallMode(input: {
  userId: string;
  isGuest: boolean;
  memoryEnabled: boolean;
}): Promise<MemoryRecallDecision> {
  if (!input.userId || input.isGuest) return decision("off", "guest");
  if (!input.memoryEnabled) return decision("off", "memory_disabled");
  const configured = process.env.AI_MEMORY_RECALL_MODE;
  if (!configured) return decision("off", "default_off");
  if (configured !== "off" && configured !== "shadow" && configured !== "active") {
    return decision("off", "invalid_mode");
  }
  return decision(configured, "configured");
}
