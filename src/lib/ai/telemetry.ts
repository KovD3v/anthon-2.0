import { normalizePreDeliveryCapabilityUsage } from "@/lib/ai/capability-usage";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

const telemetryLogger = createLogger("ai");
const MAX_LABEL_LENGTH = 128;

export type AiGenerationTelemetryContext = {
  distinctId: string;
  traceId: string;
  conversationId?: string;
  planId?: string | null;
  effectiveModelTier?: string;
  userRole?: string;
  isGuest?: boolean;
  promptMode?: string;
  experimentId?: string;
  pairId?: string;
  experimentRole?: string;
};

function boundedLabel(value: string | null | undefined) {
  return value?.slice(0, MAX_LABEL_LENGTH);
}

/**
 * Capture only a fixed allowlist of non-content generation metadata.
 *
 * Deliberately accept the complete AIMetrics object, then select safe scalar
 * fields. This prevents reasoning content, prompt traces, and tool payloads
 * from reaching PostHog even if those fields are present on the metrics object.
 */
export function captureAiGenerationMetadata({
  context,
  metrics,
}: {
  context: AiGenerationTelemetryContext;
  metrics: AIMetrics;
}) {
  try {
    getPostHogClient().capture({
      distinctId: boundedLabel(context.distinctId) ?? "unknown",
      event: "$ai_generation",
      properties: {
        $ai_lib: "anthon-ai-sdk",
        $ai_provider: boundedLabel(metrics.provider ?? "openrouter"),
        $ai_model: boundedLabel(metrics.model),
        $ai_http_status: 200,
        $ai_input_tokens: metrics.inputTokens,
        $ai_output_tokens: metrics.outputTokens,
        ...(metrics.reasoningTokens !== null
          ? { $ai_reasoning_tokens: metrics.reasoningTokens }
          : {}),
        $ai_latency: metrics.generationTimeMs / 1000,
        $ai_trace_id: boundedLabel(context.traceId),
        $ai_total_cost_usd: metrics.costUsd,
        conversationId: boundedLabel(context.conversationId),
        planId: boundedLabel(context.planId ?? "free"),
        effectiveModelTier: boundedLabel(context.effectiveModelTier),
        userRole: boundedLabel(context.userRole ?? "USER"),
        isGuest: context.isGuest ?? false,
        promptMode: boundedLabel(context.promptMode),
        experimentId: boundedLabel(context.experimentId),
        pairId: boundedLabel(context.pairId),
        experimentRole: boundedLabel(context.experimentRole),
        ragAttempted: metrics.ragAttempted ?? false,
        ragUsed: metrics.ragUsed,
        ragChunksCount: metrics.ragChunksCount,
        capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
          metrics.capabilitiesUsed,
        ),
        toolCallCount: metrics.toolCallCount ?? 0,
        ...(metrics.toolOutcomes
          ? {
              toolConsideredCount: metrics.toolOutcomes.considered,
              toolAllowedCount: metrics.toolOutcomes.allowed,
              toolSucceededCount: metrics.toolOutcomes.succeeded,
              toolUsefulCount: metrics.toolOutcomes.useful,
              toolUtilizedCount: metrics.toolOutcomes.utilized,
            }
          : {}),
        reasoningTimeMs: metrics.reasoningTimeMs,
      },
    });
  } catch (error) {
    // Analytics must never make an otherwise successful coaching turn fail.
    telemetryLogger.warn(
      "ai.telemetry.capture_failed",
      "Failed to capture AI generation metadata",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        traceId: boundedLabel(context.traceId),
      },
    );
  }
}
