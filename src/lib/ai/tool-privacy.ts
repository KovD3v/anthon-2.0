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
  const safeTextIds = new Map<string, string>();
  const safeMessageIds = new Map<string, string>();

  function getSafeId(value: unknown, ids: Map<string, string>, prefix: string) {
    if (typeof value !== "string" || value.length === 0) return null;

    const existing = ids.get(value);
    if (existing) return existing;

    const safeId = `${prefix}-${ids.size + 1}`;
    ids.set(value, safeId);
    return safeId;
  }

  function getSafeToolCallId(record: Record<string, unknown>) {
    return getSafeId(record.toolCallId, safeToolCallIds, "safe-tool");
  }

  function getSafeToolName(record: Record<string, unknown>) {
    return typeof record.toolName === "string" &&
      /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(record.toolName)
      ? record.toolName
      : "tool";
  }

  return (chunk: unknown): Record<string, unknown> | null => {
    const record = asRecord(chunk);
    if (!record || typeof record.type !== "string") return null;

    switch (record.type) {
      case "start": {
        const messageId = getSafeId(
          record.messageId,
          safeMessageIds,
          "safe-message",
        );
        return messageId
          ? { type: record.type, messageId }
          : { type: record.type };
      }
      case "start-step":
      case "finish-step":
        return { type: record.type };
      case "text-start":
      case "text-end": {
        const id = getSafeId(record.id, safeTextIds, "safe-text");
        return id ? { type: record.type, id } : null;
      }
      case "text-delta": {
        const id = getSafeId(record.id, safeTextIds, "safe-text");
        return id && typeof record.delta === "string"
          ? { type: record.type, id, delta: record.delta }
          : null;
      }
      case "finish": {
        const finishReasons = new Set([
          "stop",
          "length",
          "content-filter",
          "tool-calls",
          "error",
          "other",
        ]);
        return typeof record.finishReason === "string" &&
          finishReasons.has(record.finishReason)
          ? { type: record.type, finishReason: record.finishReason }
          : { type: record.type };
      }
      case "error":
        return { type: record.type, errorText: "An error occurred." };
      case "abort":
        return { type: record.type };
      case "tool-input-start": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        const toolName = getSafeToolName(record);
        return { type: record.type, toolCallId, toolName };
      }
      case "tool-input-delta": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        return { type: record.type, toolCallId, inputTextDelta: "" };
      }
      case "tool-input-available": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        const toolName = getSafeToolName(record);
        return { type: record.type, toolCallId, toolName, input: {} };
      }
      case "tool-input-error": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        const toolName = getSafeToolName(record);
        return {
          type: record.type,
          toolCallId,
          toolName,
          input: {},
          errorText: "Tool execution failed",
        };
      }
      case "tool-output-available": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        return {
          type: record.type,
          toolCallId,
          output: { status: "completed" },
        };
      }
      case "tool-output-error": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        return {
          type: record.type,
          toolCallId,
          errorText: "Tool execution failed",
        };
      }
      case "tool-output-denied": {
        const toolCallId = getSafeToolCallId(record);
        if (!toolCallId) return null;
        return { type: record.type, toolCallId };
      }
      case "tool-approval-request":
      case "tool-approval-response":
        return null;
      default:
        return null;
    }
  };
}
