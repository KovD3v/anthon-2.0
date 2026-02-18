/**
 * Guest Usage API Route
 *
 * GET /api/guest/usage - Get current guest user's usage and limits
 */

import { authenticateGuest } from "@/lib/guest-auth";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { getDailyUsage, getRateLimitsForUser } from "@/lib/rate-limit";

export const runtime = "nodejs";
const logger = createLogger("usage");

export async function GET(request?: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/guest/usage", channel: "WEB_GUEST" },
    async () => {
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

        logger.info("usage.snapshot.guest", "Fetched guest usage snapshot", {
          userId: user.id,
          tier: "GUEST",
          requests: `${usage.requestCount}/${limits.maxRequestsPerDay}`,
          inputTokens: `${usage.inputTokens}/${limits.maxInputTokensPerDay}`,
          outputTokens: `${usage.outputTokens}/${limits.maxOutputTokensPerDay}`,
          costUsd: `${usage.totalCostUsd.toFixed(6)}/${limits.maxCostPerDay}`,
        });

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
      } catch (error) {
        logger.error(
          "usage.fetch_guest.failed",
          "Failed to fetch guest usage",
          {
            error,
          },
        );
        return Response.json(
          { error: "Failed to fetch usage" },
          { status: 500 },
        );
      }
    },
  );
}
