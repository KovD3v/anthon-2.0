/**
 * Session Summary Cache
 *
 * Database-backed cache for session summaries.
 * Replaces the in-memory Map that was lost on serverless cold starts.
 */

import { SESSION } from "@/lib/ai/constants";
import { prisma } from "@/lib/db";

/**
 * Get a cached session summary from the database.
 * Returns null if not found or expired.
 */
export async function getCachedSummary(
  sessionId: string,
): Promise<string | null> {
  const cached = await prisma.sessionSummary.findUnique({
    where: { sessionId },
    select: { summary: true, expiresAt: true },
  });

  if (!cached || cached.expiresAt < new Date()) {
    // Delete expired entry if exists
    if (cached) {
      await prisma.sessionSummary
        .delete({ where: { sessionId } })
        .catch(() => {}); // Ignore if already deleted
    }
    return null;
  }

  return cached.summary;
}

/**
 * Cache a session summary in the database.
 */
export async function cacheSummary(
  userId: string,
  sessionId: string,
  summary: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION.CACHE_TTL_MS);

  await prisma.sessionSummary.upsert({
    where: { sessionId },
    update: { summary, expiresAt },
    create: {
      userId,
      sessionId,
      summary,
      expiresAt,
    },
  });
}

/**
 * Clean up expired session summaries.
 * Call this periodically or as part of a cron job.
 */
export async function cleanupExpiredSummaries(): Promise<number> {
  const result = await prisma.sessionSummary.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
