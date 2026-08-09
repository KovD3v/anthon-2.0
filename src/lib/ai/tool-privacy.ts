export type SafeToolCall = {
  name: string;
  status: "completed" | "failed";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getToolName(value: unknown): string | null {
  const record = asRecord(value);
  const name = record?.name ?? record?.toolName;
  return typeof name === "string" && name.length > 0 ? name : null;
}

function getToolStatus(value: unknown): SafeToolCall["status"] {
  const record = asRecord(value);
  return record && ("error" in record || "errorText" in record)
    ? "failed"
    : "completed";
}

/**
 * Converts any provider/tool payload into the only metadata allowed to cross
 * persistence, tracing, callbacks, and technical-response boundaries.
 */
export function redactToolCalls(toolCalls: unknown): SafeToolCall[] {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.flatMap((toolCall) => {
    const name = getToolName(toolCall);
    return name
      ? [{ name, status: getToolStatus(toolCall) } satisfies SafeToolCall]
      : [];
  });
}

function removeMemoryDeleteTarget(
  value: unknown,
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const { memoryDeleteTarget: _memoryDeleteTarget, ...safeRecord } = record;
  return safeRecord;
}

function redactPersistentMemoryPrompt(prompt: string) {
  const markers = ["USER MEMORIES\n", "USER SNAPSHOT\n"];
  const marker = markers
    .map((value) => ({ value, index: prompt.indexOf(value) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)[0];

  if (!marker) return prompt;
  return `${prompt.slice(0, marker.index + marker.value.length)}[REDACTED]`;
}

export function redactTraceMetadata(metadata: unknown): unknown {
  const record = asRecord(metadata);
  if (!record) return metadata;
  const safeRecord = removeMemoryDeleteTarget(record) ?? {};

  return {
    ...safeRecord,
    ...(record.turnPlan !== undefined
      ? {
          turnPlan:
            removeMemoryDeleteTarget(record.turnPlan) ?? record.turnPlan,
        }
      : {}),
  };
}

export function redactTracePayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (!record) return payload;
  const safeRecord = removeMemoryDeleteTarget(record) ?? {};

  return {
    ...safeRecord,
    ...(typeof record.systemPrompt === "string"
      ? { systemPrompt: redactPersistentMemoryPrompt(record.systemPrompt) }
      : {}),
    ...(record.capabilityDecision !== undefined
      ? {
          capabilityDecision:
            removeMemoryDeleteTarget(record.capabilityDecision) ??
            record.capabilityDecision,
        }
      : {}),
    ...(record.turnPlan !== undefined
      ? {
          turnPlan:
            removeMemoryDeleteTarget(record.turnPlan) ?? record.turnPlan,
        }
      : {}),
    toolCalls: redactToolCalls(record.toolCalls),
  };
}

/**
 * Removes arguments, results, approval IDs, provider metadata, and provider
 * correlation IDs from one live UI stream. Synthetic IDs preserve the AI SDK
 * chunk protocol without exposing an upstream or database identifier.
 */
export function createToolStreamRedactor() {
  const safeToolCallIds = new Map<string, string>();

  function getSafeToolCallId(record: Record<string, unknown>) {
    if (typeof record.toolCallId !== "string") return undefined;

    const existing = safeToolCallIds.get(record.toolCallId);
    if (existing) return existing;

    const safeId = `safe-tool-${safeToolCallIds.size + 1}`;
    safeToolCallIds.set(record.toolCallId, safeId);
    return safeId;
  }

  return (chunk: unknown): Record<string, unknown> | null => {
    const record = asRecord(chunk);
    if (!record || typeof record.type !== "string") return null;

    const toolCallId = getSafeToolCallId(record);
    const toolName =
      typeof record.toolName === "string" ? record.toolName : undefined;

    switch (record.type) {
      case "tool-input-start":
        return { type: record.type, toolCallId, toolName };
      case "tool-input-delta":
        return { type: record.type, toolCallId, inputTextDelta: "" };
      case "tool-input-available":
        return { type: record.type, toolCallId, toolName, input: {} };
      case "tool-input-error":
        return {
          type: record.type,
          toolCallId,
          toolName,
          input: {},
          errorText: "Tool execution failed",
        };
      case "tool-output-available":
        return {
          type: record.type,
          toolCallId,
          output: { status: "completed" },
        };
      case "tool-output-error":
        return {
          type: record.type,
          toolCallId,
          errorText: "Tool execution failed",
        };
      case "tool-output-denied":
        return { type: record.type, toolCallId };
      case "tool-approval-request":
      case "tool-approval-response":
        return null;
      default:
        return record.type.startsWith("tool-") ? null : record;
    }
  };
}
