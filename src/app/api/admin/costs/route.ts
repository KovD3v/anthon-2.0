/**
 * Admin Costs API
 * Provides detailed cost analysis data.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/admin/costs
export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30d"; // 7d, 30d, 90d, all

  try {
    const startDate = getStartDate(range);
    const whereDate = startDate ? { createdAt: { gte: startDate } } : {};
    const whereVoiceDate = startDate ? { generatedAt: { gte: startDate } } : {};

    // 1. Fetch AI Costs from Messages
    const aiCosts = await prisma.message.aggregate({
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      where: { ...whereDate, role: "ASSISTANT", costUsd: { not: null } },
    });

    // 2. Fetch AI Cost Breakdown by Model
    const aiCostByModel = await prisma.message.groupBy({
      by: ["model"],
      _sum: { costUsd: true },
      _count: true,
      where: { ...whereDate, role: "ASSISTANT", model: { not: null } },
    });

    // 3. Fetch Voice Costs from VoiceUsage
    const voiceCosts = await prisma.voiceUsage.aggregate({
      _sum: { costUsd: true, characterCount: true },
      where: whereVoiceDate,
    });

    // 4. Infrastructure Costs (Static/Estimated for now)
    // These values could eventually come from a config or external API
    const infraCosts = {
      clerk: {
        current: 0, // Free tier
        nextTier: 25, // Professional
        limit: "10,000 MAUs",
      },
      neon: {
        current: 0, // Free tier
        nextTier: 19, // Launch
        limit: "512MB RAM, 10GB Storage",
      },
      vercel: {
        current: 0, // Free tier
        nextTier: 20,
        limit: "1TB Bandwidth",
      },
      whatsapp: {
        current: 0, // Pay as you go
        templateCostAvg: 0.05,
      },
    };

    // 5. Total Cost over time (Daily breakdown)
    const aiCostDailyRaw = await prisma.message.groupBy({
      by: ["createdAt"],
      _sum: { costUsd: true },
      where: {
        role: "ASSISTANT",
        costUsd: { not: null },
        ...(startDate ? { createdAt: { gte: startDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Manually group by date string because groupBy: ["createdAt"] includes time
    const costByDayMap = new Map<string, number>();
    for (const m of aiCostDailyRaw) {
      const dateStr = m.createdAt.toISOString().split("T")[0];
      costByDayMap.set(
        dateStr,
        (costByDayMap.get(dateStr) || 0) + (m._sum.costUsd || 0),
      );
    }

    const aiCostDaily = Array.from(costByDayMap.entries()).map(
      ([date, cost]) => ({
        date,
        cost,
      }),
    );

    return NextResponse.json({
      summary: {
        totalAiCost: aiCosts._sum.costUsd || 0,
        totalVoiceCost: voiceCosts._sum.costUsd || 0,
        totalTokens:
          (aiCosts._sum.inputTokens || 0) + (aiCosts._sum.outputTokens || 0),
        totalVoiceCharacters: voiceCosts._sum.characterCount || 0,
      },
      aiBreakdown: aiCostByModel.map((m) => ({
        model: m.model,
        cost: m._sum.costUsd || 0,
        count: m._count,
      })),
      infrastructure: infraCosts,
      // We'll combine and format these in the UI for simplicity or here
      history: {
        ai: aiCostDaily,
      },
    });
  } catch (error) {
    console.error("[Costs API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost analysis" },
      { status: 500 },
    );
  }
}

function getStartDate(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return null;
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}
