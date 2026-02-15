/**
 * Daily Usage API Route
 *
 * GET /api/usage - Get current user's daily usage and limits
 */

import { getAuthUser, getFullUser } from "@/lib/auth";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { getDailyUsage } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    // Get full user with subscription
    const fullUser = await getFullUser(user.id);
    const subscriptionStatus = fullUser?.subscription?.status;
    const planId = fullUser?.subscription?.planId;
    const userRole = user.role;

    // Get daily usage
    const usage = await getDailyUsage(user.id);

    const effectiveEntitlements = await resolveEffectiveEntitlements({
      userId: user.id,
      subscriptionStatus,
      userRole,
      planId,
      isGuest: fullUser?.isGuest,
    });

    // Determine tier name for display
    let tier: "TRIAL" | "ACTIVE" | "ADMIN" = "TRIAL";
    if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
      tier = "ADMIN";
    } else if (subscriptionStatus === "ACTIVE") {
      tier = "ACTIVE";
    }

    return Response.json({
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
  } catch (err) {
    console.error("[Usage API] Error:", err);
    return Response.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
