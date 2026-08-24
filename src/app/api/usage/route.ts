/**
 * Daily Usage API Route
 *
 * GET /api/usage - Get current user's daily usage and limits
 */

import { jsonOk, serverError, unauthorized } from "@/lib/api/responses";
import { getAuthUser, getFullUser } from "@/lib/auth";
import {
  isBillingSyncStale,
  syncPersonalSubscriptionFromClerk,
} from "@/lib/billing/personal-subscription";
import {
  isOnboardingRequired,
  onboardingRequiredResponse,
} from "@/lib/onboarding/gate";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { PlanResolutionError } from "@/lib/plans";
import { getDailyUsage } from "@/lib/rate-limit";
import { getEffectivePlanId } from "@/lib/rate-limit/config";

export async function GET(_request: Request) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return unauthorized(error || "Unauthorized");
  }
  if (isOnboardingRequired(user)) return onboardingRequiredResponse();

  try {
    // Get full user with subscription
    const fullUser = await getFullUser(user.id);
    let subscriptionStatus = fullUser?.subscription?.status;
    let planId = fullUser?.subscription?.planId;
    const userRole = user.role;
    const shouldSyncSubscription =
      Boolean(fullUser?.clerkId) &&
      !fullUser?.isGuest &&
      isBillingSyncStale(fullUser?.billingSyncedAt) &&
      (!subscriptionStatus || !planId || subscriptionStatus !== "ACTIVE");

    if (shouldSyncSubscription && fullUser?.clerkId) {
      const syncedSubscription = await syncPersonalSubscriptionFromClerk({
        userId: user.id,
        clerkUserId: fullUser.clerkId,
        current: {
          status: subscriptionStatus,
          planId,
        },
      });

      subscriptionStatus = syncedSubscription?.status ?? subscriptionStatus;
      planId = syncedSubscription?.planId ?? planId;
    }

    // Get daily usage
    const usage = await getDailyUsage(user.id);

    const effectiveEntitlements = await resolveEffectiveEntitlements({
      userId: user.id,
      subscriptionStatus,
      userRole,
      planId,
      isGuest: fullUser?.isGuest,
    });

    const tier = getEffectivePlanId(
      subscriptionStatus ?? undefined,
      userRole,
      planId,
      fullUser?.isGuest,
    );

    return jsonOk({
      usage: {
        requestCount: usage.requestCount,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalCostUsd: usage.totalCostUsd,
      },
      limits: {
        maxRequests: effectiveEntitlements.limits.maxRequestsPerDay,
        maxInputTokens: effectiveEntitlements.limits.maxInputTokensPerDay,
        maxOutputTokens: effectiveEntitlements.limits.maxOutputTokensPerDay,
        maxCostUsd: effectiveEntitlements.limits.maxCostPerDay,
      },
      tier,
      subscriptionStatus: subscriptionStatus ?? null,
      entitlements: {
        modelTier: effectiveEntitlements.modelTier,
        sources: effectiveEntitlements.sources.map((source) => ({
          type: source.type,
          sourceId: source.sourceId,
          sourceLabel: source.sourceLabel,
        })),
      },
    });
  } catch (error) {
    if (
      error instanceof PlanResolutionError &&
      error.reason === "PAID_ACCESS_REQUIRED"
    ) {
      return Response.json(
        { error: "Paid access required", upgradeUrl: "/pricing" },
        { status: 402 },
      );
    }
    return serverError("Failed to fetch usage");
  }
}
