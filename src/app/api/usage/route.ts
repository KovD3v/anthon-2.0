/**
 * Daily Usage API Route
 *
 * GET /api/usage - Get current user's daily usage and limits
 */

import { getAuthUser, getFullUser } from "@/lib/auth";
import { getDailyUsage, getRateLimitsForUser } from "@/lib/rate-limit";

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
    const userRole = user.role;

    // Get daily usage
    const usage = await getDailyUsage(user.id);

    // Determine rate limits based on subscription and role
    const limits = getRateLimitsForUser(
      subscriptionStatus ?? undefined,
      userRole,
    );

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
        maxRequests: limits.maxRequestsPerDay,
        maxInputTokens: limits.maxInputTokensPerDay,
        maxOutputTokens: limits.maxOutputTokensPerDay,
        maxCostUsd: limits.maxCostPerDay,
      },
      tier,
      subscriptionStatus: subscriptionStatus ?? null,
    });
  } catch (err) {
    console.error("[Usage API] Error:", err);
    return Response.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
