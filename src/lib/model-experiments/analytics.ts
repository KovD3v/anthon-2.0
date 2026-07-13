import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

const logger = createLogger("ai");

export const MODEL_COMPARISON_EVENTS = {
  exposed: "model_comparison_exposed",
  ready: "model_comparison_ready",
  voted: "model_comparison_voted",
  partialFailure: "model_comparison_partial_failure",
  failed: "model_comparison_failed",
  expired: "model_comparison_expired",
  canonicalFeedback: "model_comparison_canonical_feedback",
} as const;

export function captureModelComparisonEvent(
  event: (typeof MODEL_COMPARISON_EVENTS)[keyof typeof MODEL_COMPARISON_EVENTS],
  distinctId: string,
  properties: Record<string, string | number | boolean | null | undefined>,
) {
  try {
    getPostHogClient().capture({ distinctId, event, properties });
  } catch (error) {
    logger.warn(
      "model_comparison.analytics_failed",
      "Model comparison analytics capture failed",
      { error, event },
    );
  }
}
