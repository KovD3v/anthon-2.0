import { normalizePreDeliveryCapabilityUsage } from "@/lib/ai/capability-usage";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import {
  type ExecutionRouteTrace,
  parseExecutionRouteTrace,
} from "@/lib/ai/execution-route-trace";
import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";
import type { ClientTraceV1 } from "@/lib/response-profiler/contracts";

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

function executionRouteTelemetryProperties(trace: ExecutionRouteTrace) {
  return {
    routing_mode: trace.routingMode,
    eligible_profile: trace.eligibleProfile,
    planned_profile: trace.plannedProfile,
    executed_profile: trace.executedProfile,
    task_kind: trace.taskKind,
    decision_source: trace.decisionSource,
    confidence_bucket: trace.confidenceBucket,
    policy_version: trace.policyVersion,
    classifier_version: trace.classifierVersion,
    attempt_count: trace.attempts.length,
    escalated: trace.escalation !== undefined,
    ...(trace.escalation ? { escalation_reason: trace.escalation.reason } : {}),
    ...(trace.classificationLatencyMs !== undefined
      ? { classification_latency_ms: trace.classificationLatencyMs }
      : {}),
    routing_overhead_ms: trace.routingOverheadMs,
    ...(trace.totalRequestTimeToFirstTokenMs !== undefined
      ? { total_request_ttft_ms: trace.totalRequestTimeToFirstTokenMs }
      : {}),
  };
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
  const executionRoute = metrics.executionRoute
    ? parseExecutionRouteTrace(metrics.executionRoute)
    : null;

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
        ...(metrics.memoryRecall
          ? {
              memoryRecallMode: metrics.memoryRecall.mode,
              memoryRecallReason: boundedLabel(metrics.memoryRecall.reason),
              memoryRecallFactCount: metrics.memoryRecall.factCount,
              memoryRecallEvidenceCount: metrics.memoryRecall.evidenceCount,
              memoryRecallFactMs: metrics.memoryRecall.factRecallMs,
              memoryRecallConversationMs:
                metrics.memoryRecall.conversationRecallMs,
              memoryRecallDegraded: metrics.memoryRecall.degraded,
            }
          : {}),
        ...(metrics.toolOutcomes
          ? {
              toolConsideredCount: metrics.toolOutcomes.considered,
              toolAllowedCount: metrics.toolOutcomes.allowed,
              toolSucceededCount: metrics.toolOutcomes.succeeded,
              toolUsefulCount: metrics.toolOutcomes.useful,
              toolUtilizedCount: metrics.toolOutcomes.utilized,
            }
          : {}),
        ...(executionRoute
          ? executionRouteTelemetryProperties(executionRoute)
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

export function captureClientTraceStored({
  distinctId,
  trace,
  model,
  provider,
  executionRoute,
}: {
  distinctId: string;
  trace: ClientTraceV1;
  model?: string | null;
  provider?: string | null;
  executionRoute?: unknown;
}) {
  const route = parseExecutionRouteTrace(executionRoute);
  try {
    getPostHogClient().capture({
      distinctId: boundedLabel(distinctId) ?? "unknown",
      event: "ai_client_response_trace",
      properties: {
        client_trace_status: trace.status,
        first_delta_ms: trace.milestones.firstTextDeltaReceivedMs,
        first_visible_ms: trace.milestones.firstVisibleFrameMs,
        perceived_completion_ms: trace.milestones.streamCompletedMs,
        model: boundedLabel(model),
        provider: boundedLabel(provider),
        executed_profile: route?.executedProfile,
      },
    });
  } catch (error) {
    telemetryLogger.warn(
      "ai.telemetry.client_trace_capture_failed",
      "Failed to capture client response trace summary",
      {
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
  }
}

/**
 * Emits one privacy-safe routing event when a routed turn reaches a terminal
 * outcome, including failures that never create assistant metrics or a message.
 */
export function captureAiExecutionRouting({
  context,
  executionRoute,
  costUsd,
}: {
  context: AiGenerationTelemetryContext;
  executionRoute: ExecutionRouteTrace;
  costUsd?: number;
}) {
  const trace = parseExecutionRouteTrace(executionRoute);
  if (!trace) {
    telemetryLogger.warn(
      "ai.telemetry.invalid_execution_route",
      "Skipped invalid execution route telemetry",
      { traceId: boundedLabel(context.traceId) },
    );
    return;
  }

  const terminalOutcome = trace.attempts.at(-1)?.outcome;
  if (!terminalOutcome) return;

  try {
    getPostHogClient().capture({
      distinctId: boundedLabel(context.distinctId) ?? "unknown",
      event: "ai_execution_routing",
      properties: {
        ...executionRouteTelemetryProperties(trace),
        terminal_outcome: terminalOutcome,
        ...(typeof costUsd === "number" && Number.isFinite(costUsd)
          ? { total_cost_usd: costUsd }
          : {}),
        $ai_trace_id: boundedLabel(context.traceId),
      },
    });
  } catch (error) {
    telemetryLogger.warn(
      "ai.telemetry.routing_capture_failed",
      "Failed to capture AI execution routing",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        traceId: boundedLabel(context.traceId),
      },
    );
  }
}
