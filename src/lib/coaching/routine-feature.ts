import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

export const ROUTINE_FEATURE_FLAG = "routine-loop-v1";

type RoutineFeatureSubject = {
  distinctId: string | null;
  role: string;
  isGuest: boolean;
};

const logger = createLogger("ai");

/**
 * Resolves the rollout gate for the routine loop.
 *
 * Administrators retain access for validation and support. Everyone else is
 * fail-closed when PostHog is unavailable or the flag is not enabled.
 */
export async function isRoutineFeatureEnabled({
  distinctId,
  role,
}: RoutineFeatureSubject): Promise<boolean> {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    return true;
  }

  if (!distinctId || !process.env.POSTHOG_API_KEY) {
    return false;
  }

  try {
    const value = await getPostHogClient().getFeatureFlag(
      ROUTINE_FEATURE_FLAG,
      distinctId,
      { sendFeatureFlagEvents: false },
    );
    return value === true || value === "on";
  } catch (error) {
    logger.warn(
      "routine.feature_flag_failed",
      "Routine feature flag evaluation failed closed",
      { error, flag: ROUTINE_FEATURE_FLAG },
    );
    return false;
  }
}
