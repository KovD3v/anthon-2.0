/**
 * Guest Usage API Route
 *
 * GET /api/guest/usage - Get current guest user's usage and limits
 */

import { getExistingGuestUser } from "@/lib/guest-auth";
import { getDailyUsage, getRateLimitsForUser } from "@/lib/rate-limit";

export async function GET(_request: Request) {
  try {
    // Get limits for guest
    const limits = getRateLimitsForUser(
      undefined,
      "USER",
      null,
      true, // isGuest
    );

    const user = await getExistingGuestUser();

    if (!user) {
      return Response.json({
        usage: {
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCostUsd: 0,
        },
        limits: {
          maxRequests: limits.maxRequestsPerDay,
          maxInputTokens: limits.maxInputTokensPerDay,
          maxOutputTokens: limits.maxOutputTokensPerDay,
          maxCostUsd: limits.maxCostPerDay,
        },
        tier: "GUEST",
        subscriptionStatus: null,
      });
    }

    // Get daily usage for guest
    const usage = await getDailyUsage(user.id);

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
      tier: "GUEST",
      subscriptionStatus: null,
    });
  } catch {
    return Response.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
