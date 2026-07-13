import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { resolveModelComparisonPair } from "./service";

const logger = createLogger("ai");

export async function maintainModelComparisons(now = new Date()) {
  const expired = await prisma.modelExperimentPair.findMany({
    where: {
      status: { in: ["GENERATING", "READY"] },
      expiresAt: { lte: now },
      canonicalMessageId: null,
      responses: {
        some: { variant: { role: "CONTROL" }, status: "COMPLETED" },
      },
    },
    select: { id: true, userId: true, user: { select: { clerkId: true } } },
    take: 100,
  });

  let resolved = 0;
  for (const pair of expired) {
    if (!pair.user.clerkId) continue;
    try {
      await resolveModelComparisonPair({
        pairId: pair.id,
        userId: pair.userId,
        clerkId: pair.user.clerkId,
        choice: "AUTO_CONTROL",
      });
      resolved++;
    } catch (error) {
      logger.warn(
        "model_comparison.expiry_failed",
        "Failed to resolve expired model comparison",
        { error, pairId: pair.id },
      );
    }
  }

  const purgeCandidates = await prisma.modelExperimentPair.findMany({
    where: {
      contentPurgeAt: { lte: now },
      selectedVariantId: { not: null },
    },
    select: { id: true, selectedVariantId: true },
    take: 500,
  });
  let purged = 0;
  for (const pair of purgeCandidates) {
    const result = await prisma.modelExperimentResponse.updateMany({
      where: {
        pairId: pair.id,
        variantId: { not: pair.selectedVariantId ?? undefined },
        status: { not: "PURGED" },
      },
      data: { parts: Prisma.DbNull, text: null, status: "PURGED" },
    });
    purged += result.count;
  }
  return { expiredResolved: resolved, responsesPurged: purged };
}
