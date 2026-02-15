/**
 * Rate Limit Module — daily usage tracking.
 */

import { prisma } from "@/lib/db";
import type { DailyUsageData } from "./types";

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

/**
 * Get today's date in UTC with time set to 00:00:00.
 */
function getUTCDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// -----------------------------------------------------
// USAGE DATA
// -----------------------------------------------------

/**
 * Get or create today's usage record for a user.
 */
export async function getDailyUsage(userId: string): Promise<DailyUsageData> {
  const today = getUTCDateOnly();

  const usage = await prisma.dailyUsage.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!usage) {
    return {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    };
  }

  return {
    requestCount: usage.requestCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.totalCostUsd,
  };
}

/**
 * Increment usage counters for a user.
 * Creates the record if it doesn't exist.
 */
export async function incrementUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<DailyUsageData> {
  const today = getUTCDateOnly();

  const usage = await prisma.dailyUsage.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    create: {
      userId,
      date: today,
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalCostUsd: costUsd,
    },
    update: {
      requestCount: { increment: 1 },
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      totalCostUsd: { increment: costUsd },
    },
  });

  return {
    requestCount: usage.requestCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.totalCostUsd,
  };
}
