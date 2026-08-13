import type { UserRole } from "@/generated/prisma";
import { LIGHT_EXECUTION_MODEL_ID } from "@/lib/ai/execution-model";
import { parseExecutionRouteTrace } from "@/lib/ai/execution-route-trace";
import type { Usage } from "@/types/chat";

type PersistedTechnicalMetricRow = {
  model?: string | null;
  provider?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  costUsd?: number | null;
  generationTimeMs?: number | null;
  reasoningTimeMs?: number | null;
  toolCallCount?: number | null;
  toolResultChars?: number | null;
  toolTiming?: unknown;
  ragUsed?: boolean | null;
  ragChunksCount?: number | null;
  executionRoute?: unknown;
};

interface PersistedTechnicalMessage {
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens?: number | null;
  costUsd: number | null;
  generationTimeMs: number | null;
  reasoningTimeMs: number | null;
  ragUsed: boolean | null;
  ragChunksCount?: number | null;
  toolCalls: unknown;
  metadata?: unknown;
  metrics?: PersistedTechnicalMetricRow | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number = nonNegativeNumber(value);
  return number === undefined ? undefined : Math.floor(number);
}

function readToolTiming(value: unknown): Usage["toolTiming"] {
  if (!isRecord(value)) return undefined;

  const firstModelStepMs = nonNegativeInteger(value.firstModelStepMs);
  const toolExecutionMs = nonNegativeInteger(value.toolExecutionMs);
  const finalModelStepMs = nonNegativeInteger(value.finalModelStepMs);

  if (
    firstModelStepMs === undefined &&
    toolExecutionMs === undefined &&
    finalModelStepMs === undefined
  ) {
    return undefined;
  }

  return {
    ...(firstModelStepMs !== undefined ? { firstModelStepMs } : {}),
    ...(toolExecutionMs !== undefined ? { toolExecutionMs } : {}),
    ...(finalModelStepMs !== undefined ? { finalModelStepMs } : {}),
  };
}

function readMemoryRecall(metadata: unknown): Usage["memoryRecall"] {
  if (!isRecord(metadata) || !isRecord(metadata.ai)) return undefined;
  const value = metadata.ai.memoryRecall;
  if (!isRecord(value)) return undefined;

  const mode = value.mode;
  const reason = value.reason;
  const factCount = nonNegativeInteger(value.factCount);
  const evidenceCount = nonNegativeInteger(value.evidenceCount);
  const factRecallMs = nonNegativeInteger(value.factRecallMs);
  const conversationRecallMs = nonNegativeInteger(value.conversationRecallMs);

  if (
    (mode !== "off" && mode !== "shadow" && mode !== "active") ||
    typeof reason !== "string" ||
    factCount === undefined ||
    evidenceCount === undefined ||
    factRecallMs === undefined ||
    conversationRecallMs === undefined ||
    typeof value.degraded !== "boolean"
  ) {
    return undefined;
  }

  return {
    mode,
    reason,
    factCount,
    evidenceCount,
    factRecallMs,
    conversationRecallMs,
    degraded: value.degraded,
  };
}

function readRagAttempted(metadata: unknown): boolean | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.ai)) return undefined;
  return typeof metadata.ai.ragAttempted === "boolean"
    ? metadata.ai.ragAttempted
    : undefined;
}

function countToolCalls(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

export function buildTechnicalUsage(
  message: PersistedTechnicalMessage,
  options: { includeDiagnostics?: boolean } = {},
): Usage | undefined {
  if (message.inputTokens === null) return undefined;

  const metrics = message.metrics;
  const includeDiagnostics = options.includeDiagnostics !== false;
  const executionRoute = includeDiagnostics
    ? parseExecutionRouteTrace(metrics?.executionRoute)
    : null;
  const model = metrics?.model ?? message.model;
  const executedProfile = model
    ? model === LIGHT_EXECUTION_MODEL_ID
      ? "light"
      : "standard"
    : undefined;
  const provider = metrics?.provider?.trim();
  const reasoningTokens = metrics?.reasoningTokens ?? message.reasoningTokens;
  const toolCallCount =
    metrics?.toolCallCount ?? countToolCalls(message.toolCalls);
  const toolResultChars = metrics?.toolResultChars ?? undefined;
  const toolTiming = readToolTiming(metrics?.toolTiming);
  const ragAttempted = readRagAttempted(message.metadata);
  const ragUsed = metrics?.ragUsed ?? message.ragUsed;
  const ragChunksCount = metrics?.ragChunksCount ?? message.ragChunksCount;
  const memoryRecall = readMemoryRecall(message.metadata);

  return {
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens ?? 0,
    cost: message.costUsd ?? 0,
    ...(message.generationTimeMs !== null
      ? { generationTimeMs: message.generationTimeMs }
      : {}),
    ...(message.reasoningTimeMs !== null
      ? { reasoningTimeMs: message.reasoningTimeMs }
      : {}),
    ...(includeDiagnostics && model ? { model } : {}),
    ...(includeDiagnostics && provider ? { provider } : {}),
    ...(includeDiagnostics && executedProfile ? { executedProfile } : {}),
    ...(includeDiagnostics && typeof reasoningTokens === "number"
      ? { reasoningTokens }
      : {}),
    ...(includeDiagnostics && toolCallCount !== undefined
      ? { toolCallCount }
      : {}),
    ...(includeDiagnostics && toolResultChars !== undefined
      ? { toolResultChars }
      : {}),
    ...(includeDiagnostics && toolTiming ? { toolTiming } : {}),
    ...(includeDiagnostics && ragAttempted !== undefined
      ? { ragAttempted }
      : {}),
    ...(includeDiagnostics && ragUsed !== null ? { ragUsed } : {}),
    ...(includeDiagnostics && typeof ragChunksCount === "number"
      ? { ragChunksCount }
      : {}),
    ...(includeDiagnostics && memoryRecall ? { memoryRecall } : {}),
    ...(includeDiagnostics && executionRoute
      ? {
          executionRoute: {
            ...executionRoute,
            reasonCodes: [...executionRoute.reasonCodes],
            attempts: executionRoute.attempts.map((attempt) => ({
              ...attempt,
            })),
          },
        }
      : {}),
  };
}

export type TechnicalMetricsVisibilityInput = {
  role: UserRole;
  preference: boolean | null | undefined;
  isGuest: boolean;
  isPrivateOwner: boolean;
};

export function getDefaultTechnicalMetricsPreference(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function resolveTechnicalMetricsVisibility(
  input: TechnicalMetricsVisibilityInput,
): boolean {
  if (input.isGuest || !input.isPrivateOwner) {
    return false;
  }

  // Local development keeps the diagnostics discoverable by default, while an
  // explicit profile override must still be able to turn them off.
  if (process.env.NODE_ENV === "development" && input.preference == null) {
    return true;
  }

  return input.preference ?? getDefaultTechnicalMetricsPreference(input.role);
}

/**
 * Resolve access to the expanded profiler payload.
 *
 * Compact technical metrics keep their existing role/default behavior. The
 * expanded payload is intentionally limited to local development and an
 * explicitly authorized SUPER_ADMIN in production so internal diagnostics do
 * not become generally available just because a user opts into the compact
 * metrics preference.
 */
export function resolveTechnicalDiagnosticsVisibility(
  input: TechnicalMetricsVisibilityInput,
): boolean {
  if (!resolveTechnicalMetricsVisibility(input)) {
    return false;
  }

  return process.env.NODE_ENV === "development" || input.role === "SUPER_ADMIN";
}
