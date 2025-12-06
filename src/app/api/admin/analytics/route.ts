/**
 * Admin Analytics API
 * Provides aggregated statistics for the admin dashboard.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/admin/analytics
export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "7d"; // 7d, 30d, 90d, all
  const type = searchParams.get("type") || "overview"; // overview, usage, costs, funnel

  try {
    const startDate = getStartDate(range);

    switch (type) {
      case "overview":
        return NextResponse.json(await getOverviewStats(startDate));
      case "usage":
        return NextResponse.json(await getUsageStats(startDate));
      case "costs":
        return NextResponse.json(await getCostStats(startDate));
      case "funnel":
        return NextResponse.json(await getFunnelStats());
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}

/**
 * Calculate start date from range string
 */
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
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Overview statistics for the dashboard KPI cards
 */
async function getOverviewStats(startDate: Date | null) {
  const whereDate = startDate ? { createdAt: { gte: startDate } } : {};

  const [
    totalUsers,
    newUsers,
    totalMessages,
    newMessages,
    totalCost,
    ragDocuments,
  ] = await Promise.all([
    // Total users
    prisma.user.count(),
    // New users in period
    prisma.user.count({ where: whereDate }),
    // Total messages
    prisma.message.count(),
    // Messages in period
    prisma.message.count({ where: whereDate }),
    // Total AI cost
    prisma.message.aggregate({
      _sum: { costUsd: true },
      where: { ...whereDate, costUsd: { not: null } },
    }),
    // RAG documents count
    prisma.ragDocument.count(),
  ]);

  // Average messages per user
  const avgMessagesPerUser = totalUsers > 0 ? totalMessages / totalUsers : 0;

  // Cost per user in period
  const costPerUser =
    newUsers > 0 ? (totalCost._sum.costUsd || 0) / newUsers : 0;

  return {
    totalUsers,
    newUsersInPeriod: newUsers,
    totalMessages,
    messagesInPeriod: newMessages,
    totalCostUsd: totalCost._sum.costUsd || 0,
    costInPeriod: totalCost._sum.costUsd || 0,
    avgMessagesPerUser: Math.round(avgMessagesPerUser * 10) / 10,
    costPerUser: Math.round(costPerUser * 1000000) / 1000000, // 6 decimal places
    ragDocuments,
  };
}

/**
 * Usage statistics - messages over time, user activity
 */
async function getUsageStats(startDate: Date | null) {
  const whereDate = startDate ? { createdAt: { gte: startDate } } : {};

  // Get all messages and manually group by date
  const messages = await prisma.message.findMany({
    where: whereDate,
    select: { createdAt: true, userId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  // Group messages by day
  const messagesByDay = new Map<string, number>();
  for (const m of messages) {
    const dateStr = m.createdAt.toISOString().split("T")[0];
    messagesByDay.set(dateStr, (messagesByDay.get(dateStr) || 0) + 1);
  }

  // Get user registrations by day
  const users = await prisma.user.findMany({
    where: whereDate,
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const usersByDay = new Map<string, number>();
  for (const u of users) {
    const dateStr = u.createdAt.toISOString().split("T")[0];
    usersByDay.set(dateStr, (usersByDay.get(dateStr) || 0) + 1);
  }

  // Get message distribution per user
  const messageCountsRaw = await prisma.message.groupBy({
    by: ["userId"],
    _count: true,
  });

  // Create distribution buckets
  const distribution = {
    "0": 0,
    "1-10": 0,
    "11-50": 0,
    "51-100": 0,
    "101-500": 0,
    "500+": 0,
  };

  const totalUserCount = await prisma.user.count();
  const usersWithMessages = new Set(messageCountsRaw.map((m) => m.userId));
  distribution["0"] = totalUserCount - usersWithMessages.size;

  for (const m of messageCountsRaw) {
    const count = m._count;
    if (count <= 10) distribution["1-10"]++;
    else if (count <= 50) distribution["11-50"]++;
    else if (count <= 100) distribution["51-100"]++;
    else if (count <= 500) distribution["101-500"]++;
    else distribution["500+"]++;
  }

  // Active users (sent at least 1 message in period)
  const activeUsers = await prisma.message.groupBy({
    by: ["userId"],
    where: { ...whereDate, role: "USER" },
  });

  return {
    messagesByDay: Object.fromEntries(messagesByDay),
    usersByDay: Object.fromEntries(usersByDay),
    messageDistribution: distribution,
    activeUsersInPeriod: activeUsers.length,
    totalUsers: totalUserCount,
  };
}

/**
 * Cost statistics - AI spending breakdown
 */
async function getCostStats(startDate: Date | null) {
  const whereDate = startDate ? { createdAt: { gte: startDate } } : {};

  // Total cost and tokens
  const totals = await prisma.message.aggregate({
    _sum: {
      costUsd: true,
      outputTokens: true,
      reasoningTokens: true,
    },
    _avg: {
      costUsd: true,
      outputTokens: true,
      generationTimeMs: true,
    },
    _count: true,
    where: { ...whereDate, role: "ASSISTANT" },
  });

  // Cost by model
  const costByModelRaw = await prisma.message.groupBy({
    by: ["model"],
    _sum: { costUsd: true },
    _count: true,
    where: { ...whereDate, model: { not: null } },
  });

  const costByModel = costByModelRaw.map((m) => ({
    model: m.model || "unknown",
    totalCost: m._sum.costUsd || 0,
    messageCount: m._count,
  }));

  // Cost over time (by day)
  // Include all assistant messages, not just those with non-null costUsd
  const messagesWithCost = await prisma.message.findMany({
    where: { ...whereDate, role: "ASSISTANT" },
    select: { createdAt: true, costUsd: true },
    orderBy: { createdAt: "asc" },
  });

  const costByDay = new Map<string, number>();
  for (const m of messagesWithCost) {
    const dateStr = m.createdAt.toISOString().split("T")[0];
    costByDay.set(dateStr, (costByDay.get(dateStr) || 0) + (m.costUsd || 0));
  }

  return {
    totalCostUsd: totals._sum.costUsd || 0,
    totalOutputTokens: totals._sum.outputTokens || 0,
    totalReasoningTokens: totals._sum.reasoningTokens || 0,
    avgCostPerMessage: totals._avg.costUsd || 0,
    avgOutputTokens: Math.round(totals._avg.outputTokens || 0),
    avgGenerationTimeMs: Math.round(totals._avg.generationTimeMs || 0),
    assistantMessageCount: totals._count,
    costByModel,
    costByDay: Object.fromEntries(costByDay),
  };
}

/**
 * Funnel statistics - registration to conversion
 */
async function getFunnelStats() {
  // Total registered users
  const totalUsers = await prisma.user.count();

  // Users who started a trial
  const trialStarted = await prisma.subscription.count({
    where: { trialStartedAt: { not: null } },
  });

  // Users who converted (paid)
  const converted = await prisma.subscription.count({
    where: { convertedAt: { not: null } },
  });

  // Active subscribers
  const activeSubscribers = await prisma.subscription.count({
    where: { status: "ACTIVE" },
  });

  // Churned (canceled)
  const churned = await prisma.subscription.count({
    where: { status: "CANCELED" },
  });

  // Users who sent at least one message (engaged)
  const engagedUsers = await prisma.message.groupBy({
    by: ["userId"],
    where: { role: "USER" },
  });

  // Calculate rates
  const registeredToEngagedRate =
    totalUsers > 0 ? (engagedUsers.length / totalUsers) * 100 : 0;

  const engagedToTrialRate =
    engagedUsers.length > 0 ? (trialStarted / engagedUsers.length) * 100 : 0;

  const trialToConvertedRate =
    trialStarted > 0 ? (converted / trialStarted) * 100 : 0;

  const overallConversionRate =
    totalUsers > 0 ? (converted / totalUsers) * 100 : 0;

  return {
    funnel: {
      registered: totalUsers,
      engaged: engagedUsers.length,
      trialStarted,
      converted,
      active: activeSubscribers,
      churned,
    },
    conversionRates: {
      registeredToEngaged: Math.round(registeredToEngagedRate * 10) / 10,
      engagedToTrial: Math.round(engagedToTrialRate * 10) / 10,
      trialToConverted: Math.round(trialToConvertedRate * 10) / 10,
      overallConversion: Math.round(overallConversionRate * 10) / 10,
    },
  };
}
