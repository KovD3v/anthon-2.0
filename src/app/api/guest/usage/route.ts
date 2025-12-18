/**
 * Guest Usage API Route
 *
 * GET /api/guest/usage - Get current guest user's usage and limits
 */

import { authenticateGuest } from "@/lib/guest-auth";
import { getDailyUsage, getRateLimitsForUser } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user } = await authenticateGuest();

    // Get daily usage for guest
    const usage = await getDailyUsage(user.id);

    // Get limits for guest
    const limits = getRateLimitsForUser(
      undefined,
      "USER",
      null,
      true, // isGuest
    );

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
  } catch (err) {
    console.error("[Guest Usage API] Error:", err);
    return Response.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
