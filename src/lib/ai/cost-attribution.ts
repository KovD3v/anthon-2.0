import { waitUntil } from "@vercel/functions";
import type { LanguageModelUsage } from "ai";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { calculateCost } from "./tokenlens";

export const COST_ATTRIBUTION_RETENTION_DAYS = 90;

export type AiOperation =
  | "coaching"
  | "model_comparison"
  | "benchmark"
  | "memory_extraction"
  | "memory_gate"
  | "thread_summary"
  | "session_summary"
  | "session_archive"
  | "memory_consolidation"
  | "profile_analysis"
  | "chat_metadata"
  | "onboarding"
  | "voice_classification"
  | "transcription"
  | "embeddings"
  | "voice_synthesis";

export type AiOperationUsage = {
  operation: AiOperation;
  modelId: string;
  usage?: Partial<LanguageModelUsage>;
  providerMetadata?: Record<string, unknown>;
  failed?: boolean;
  estimatedCostUsd?: number;
};

const logger = createLogger("usage");

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return;
  if (typeof value === "string" && !value.trim()) return;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function operationUsageCounters(input: AiOperationUsage) {
  const provider = object(object(input.providerMetadata?.openrouter).usage);
  const raw = object(input.usage?.raw);
  const usage = { ...raw, ...provider };
  const inputTokens =
    number(
      usage.prompt_tokens ??
        usage.promptTokens ??
        usage.input_tokens ??
        usage.inputTokens,
    ) ??
    number(input.usage?.inputTokens) ??
    0;
  const outputTokens =
    number(
      usage.completion_tokens ??
        usage.completionTokens ??
        usage.output_tokens ??
        usage.outputTokens,
    ) ??
    number(input.usage?.outputTokens) ??
    0;
  const reasoningTokens =
    number(object(usage.completion_tokens_details).reasoning_tokens) ??
    number(object(usage.completionTokensDetails).reasoningTokens) ??
    number(input.usage?.outputTokenDetails?.reasoningTokens) ??
    0;
  const cache = object(usage.prompt_tokens_details);
  const sdkCache = object(usage.promptTokensDetails);
  const cacheReadTokens =
    number(cache.cached_tokens) ??
    number(sdkCache.cachedTokens) ??
    // OpenRouter's adapter defaults missing cache reads to zero. Do not treat
    // that synthetic zero as a provider observation.
    (Object.keys(usage).length &&
    input.usage?.inputTokenDetails?.cacheReadTokens === 0
      ? undefined
      : number(input.usage?.inputTokenDetails?.cacheReadTokens));
  const cacheWriteTokens =
    number(cache.cache_write_tokens) ??
    number(sdkCache.cacheWriteTokens) ??
    number(input.usage?.inputTokenDetails?.cacheWriteTokens);
  const providerCost = number(usage.cost);
  const estimate =
    providerCost === undefined && (inputTokens || outputTokens)
      ? calculateCost(input.modelId, inputTokens, outputTokens)
      : undefined;
  const estimatedCost =
    number(input.estimatedCostUsd) ??
    (estimate && (estimate.pricingKnown || estimate.totalCost > 0)
      ? estimate.totalCost
      : undefined);

  return {
    calls: 1,
    failedCalls: input.failed ? 1 : 0,
    inputTokens: Math.trunc(inputTokens),
    outputTokens: Math.trunc(outputTokens),
    reasoningTokens: Math.trunc(reasoningTokens),
    cacheReadTokens: Math.trunc(cacheReadTokens ?? 0),
    cacheWriteTokens: Math.trunc(cacheWriteTokens ?? 0),
    cacheReadObservedCalls: cacheReadTokens === undefined ? 0 : 1,
    cacheWriteObservedCalls: cacheWriteTokens === undefined ? 0 : 1,
    providerReportedCostUsd: providerCost ?? 0,
    estimatedCostUsd: providerCost === undefined ? (estimatedCost ?? 0) : 0,
    unknownCostCalls:
      providerCost === undefined && estimatedCost === undefined ? 1 : 0,
  };
}

/** Observes supplier work; never changes account quotas or records content. */
export async function recordAiOperation(
  input: AiOperationUsage,
): Promise<void> {
  try {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    const key = { date, operation: input.operation, model: input.modelId };
    const counters = operationUsageCounters(input);
    await prisma.dailyAiOperationUsage.upsert({
      where: { date_operation_model: key },
      create: { ...key, ...counters },
      update: Object.fromEntries(
        Object.entries(counters).map(([name, value]) => [
          name,
          { increment: value },
        ]),
      ),
    });
  } catch (error) {
    logger.warn(
      "cost_attribution.record_failed",
      "Operational cost counters could not be recorded",
      {
        operation: input.operation,
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
  }
}

/** Vercel keeps the request alive; local callers still retain the promise. */
export function scheduleCostAttribution(task: Promise<void>): void {
  try {
    waitUntil(task);
  } catch {
    // Telemetry scheduling must not change the outcome of the provider call.
  }
}

/** SDK retry errors expose prior attempts only on some failure paths. */
export async function recordAiOperationFailure(
  operation: AiOperation,
  modelId: string,
  error: unknown,
): Promise<void> {
  const failure = object(error);
  const attempts =
    Array.isArray(failure.errors) && failure.errors.length
      ? failure.errors
      : [error];
  await Promise.all(
    attempts.map((attempt) => {
      const details = object(attempt);
      let response: Record<string, unknown> = {};
      if (typeof details.responseBody === "string") {
        try {
          response = object(JSON.parse(details.responseBody));
        } catch {
          // Upstream errors may be plain text and have no usage information.
        }
      }
      return recordAiOperation({
        operation,
        modelId,
        failed: true,
        usage: {
          ...object(details.usage),
          raw:
            object(details.usage).raw ??
            object(details.data).usage ??
            response.usage,
        } as Partial<LanguageModelUsage>,
        providerMetadata: object(details.providerMetadata),
      });
    }),
  );
}

export function costAttributionCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - COST_ATTRIBUTION_RETENTION_DAYS + 1);
  return cutoff;
}

export async function deleteExpiredCostAttribution() {
  return prisma.dailyAiOperationUsage.deleteMany({
    where: { date: { lt: costAttributionCutoff() } },
  });
}

export async function getOperationCostBreakdown(startDate: Date | null) {
  const cutoff = costAttributionCutoff();
  const requestedStart = startDate ? new Date(startDate) : cutoff;
  requestedStart.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.dailyAiOperationUsage.groupBy({
    by: ["operation", "model"],
    where: { date: { gte: requestedStart > cutoff ? requestedStart : cutoff } },
    _min: { date: true },
    _sum: {
      calls: true,
      failedCalls: true,
      inputTokens: true,
      outputTokens: true,
      reasoningTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      cacheReadObservedCalls: true,
      cacheWriteObservedCalls: true,
      providerReportedCostUsd: true,
      estimatedCostUsd: true,
      unknownCostCalls: true,
    },
    orderBy: [{ operation: "asc" }, { model: "asc" }],
  });
  const dates = rows.flatMap((row) =>
    row._min.date ? [row._min.date.toISOString()] : [],
  );
  return {
    retentionDays: COST_ATTRIBUTION_RETENTION_DAYS,
    observedFrom: dates.sort()[0] ?? null,
    operations: rows.map(({ operation, model, _sum }) => ({
      operation,
      model,
      ..._sum,
    })),
  };
}

export type OperationCostBreakdown = Awaited<
  ReturnType<typeof getOperationCostBreakdown>
>;
