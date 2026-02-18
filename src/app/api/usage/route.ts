/**
 * Daily Usage API Route
 *
 * GET /api/usage - Get current user's daily usage and limits
 */

import { jsonOk, serverError, unauthorized } from "@/lib/api/responses";
import { getAuthUser, getFullUser } from "@/lib/auth";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { getDailyUsage } from "@/lib/rate-limit";
import { getEffectivePlanId } from "@/lib/rate-limit/config";

export const runtime = "nodejs";
const logger = createLogger("usage");

export async function GET(request?: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/usage", channel: "WEB" },
    async () => {
      const { user, error } = await getAuthUser();

      if (error || !user) {
        logger.warn("auth.unauthenticated", "Usage request rejected", {
          error,
        });
        return unauthorized(error || "Unauthorized");
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

        const tier = getEffectivePlanId(
          subscriptionStatus ?? undefined,
          userRole,
          planId,
          fullUser?.isGuest,
        );

        logger.info("usage.snapshot", "Fetched usage snapshot", {
          userId: user.id,
          tier,
          subscriptionStatus: subscriptionStatus ?? null,
          requests: `${usage.requestCount}/${effectiveEntitlements.limits.maxRequestsPerDay}`,
          inputTokens: `${usage.inputTokens}/${effectiveEntitlements.limits.maxInputTokensPerDay}`,
          outputTokens: `${usage.outputTokens}/${effectiveEntitlements.limits.maxOutputTokensPerDay}`,
          costUsd: `${usage.totalCostUsd.toFixed(6)}/${effectiveEntitlements.limits.maxCostPerDay}`,
          modelTier: effectiveEntitlements.modelTier,
          sources: effectiveEntitlements.sources.map((source) => source.type),
        });

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
        logger.error("usage.fetch.failed", "Failed to fetch usage snapshot", {
          error,
          userId: user.id,
        });
        return serverError("Failed to fetch usage");
      }
    },
  );
}
