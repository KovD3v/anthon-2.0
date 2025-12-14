/**
 * Eleven Labs Admin Stats API
 *
 * Aggregates voice usage data for admin dashboard.
 */

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getElevenLabsSubscription, getSystemLoad } from "@/lib/voice";

export async function GET() {
  // Require admin access
  const { errorResponse } = await requireAdmin();
  if (errorResponse) {
    return errorResponse;
  }

  try {
    // 1. Real-time data from Eleven Labs API (bypass cache for admin)
    const subscription = await getElevenLabsSubscription(true);
    const systemLoad = await getSystemLoad();

    // 2. Historical data from VoiceUsage table
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Today's stats
    const todayStats = await prisma.voiceUsage.aggregate({
      where: { generatedAt: { gte: todayStart } },
      _sum: { characterCount: true, costUsd: true },
      _count: { id: true },
    });

    // Week stats
    const weekStats = await prisma.voiceUsage.aggregate({
      where: { generatedAt: { gte: weekStart } },
      _sum: { characterCount: true, costUsd: true },
      _count: { id: true },
    });

    // Month stats
    const monthStats = await prisma.voiceUsage.aggregate({
      where: { generatedAt: { gte: monthStart } },
      _sum: { characterCount: true, costUsd: true },
      _count: { id: true },
    });

    // Daily breakdown for chart (last 14 days)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dailyBreakdown = await prisma.$queryRaw<
      Array<{
        date: Date;
        count: bigint;
        characters: bigint;
      }>
    >`
      SELECT 
        DATE("generatedAt") as date,
        COUNT(*) as count,
        COALESCE(SUM("characterCount"), 0) as characters
      FROM "VoiceUsage"
      WHERE "generatedAt" >= ${fourteenDaysAgo}
      GROUP BY DATE("generatedAt")
      ORDER BY date ASC
    `;

    // Convert BigInt to Number for JSON serialization
    const history = dailyBreakdown.map((row) => ({
      date: row.date.toISOString().split("T")[0],
      voiceMessages: Number(row.count),
      charactersUsed: Number(row.characters),
    }));

    // Channel breakdown
    const channelBreakdown = await prisma.voiceUsage.groupBy({
      by: ["channel"],
      _count: { id: true },
      _sum: { characterCount: true },
    });

    return Response.json({
      subscription: subscription
        ? {
            characterCount: subscription.character_count,
            characterLimit: subscription.character_limit,
            nextResetUnix: subscription.next_character_count_reset_unix,
          }
        : null,
      systemLoad,
      stats: {
        today: {
          voiceMessages: todayStats._count.id,
          characters: todayStats._sum.characterCount ?? 0,
          costUsd: todayStats._sum.costUsd ?? 0,
        },
        week: {
          voiceMessages: weekStats._count.id,
          characters: weekStats._sum.characterCount ?? 0,
          costUsd: weekStats._sum.costUsd ?? 0,
        },
        month: {
          voiceMessages: monthStats._count.id,
          characters: monthStats._sum.characterCount ?? 0,
          costUsd: monthStats._sum.costUsd ?? 0,
        },
      },
      history,
      channelBreakdown: channelBreakdown.map((row) => ({
        channel: row.channel,
        count: row._count.id,
        characters: row._sum.characterCount ?? 0,
      })),
    });
  } catch (error) {
    console.error("[Admin ElevenLabs Stats] Error:", error);
    return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
