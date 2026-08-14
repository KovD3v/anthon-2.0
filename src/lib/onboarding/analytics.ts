import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

const onboardingLogger = createLogger("usage");

export function trackOnboardingEvent(
  userId: string,
  event: "onboarding_step_completed" | "onboarding_completed",
  properties: Record<string, string | number | boolean>,
) {
  if (!process.env.POSTHOG_API_KEY) return;

  try {
    getPostHogClient().capture({
      distinctId: userId,
      event,
      properties,
    });
  } catch (error) {
    onboardingLogger.error(
      "onboarding.analytics_failed",
      "Onboarding analytics capture failed",
      { error, event, userId },
    );
  }
}
