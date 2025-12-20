import { prisma } from "@/lib/db";

/**
 * Calculate start date from range string
 */
export function getStartDate(range: string): Date | null {
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
export async function getOverviewStats(startDate: Date | null) {
  const whereDate = startDate ? { createdAt: { gte: startDate } } : {};

  const [
    totalUsers,
    newUsers,
    totalMessages,
    newMessages,
    totalCost,
    ragDocuments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: whereDate }),
    prisma.message.count(),
    prisma.message.count({ where: whereDate }),
    prisma.message.aggregate({
      _sum: { costUsd: true },
      where: { ...whereDate, costUsd: { not: null } },
    }),
    prisma.ragDocument.count(),
  ]);

  const avgMessagesPerUser = totalUsers > 0 ? totalMessages / totalUsers : 0;
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
    costPerUser: Math.round(costPerUser * 1000000) / 1000000,
    ragDocuments,
  };
}

/**
 * System health check logic
 */
export async function getSystemHealth() {
  const [dbHealth, vercelBlobHealth] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`.then(() => ({
      status: "connected" as const,
    })),
    // Basic connectivity check for other services could go here.
    // For now, we'll return connected if we don't hit obvious errors
    Promise.resolve({ status: "connected" as const }),
  ]);

  return {
    database:
      dbHealth.status === "fulfilled"
        ? dbHealth.value
        : {
            status: "error" as const,
            message: "Database disconnected",
          },
    openrouter: { status: "connected" as const }, // Mocked or check API
    clerk: { status: "connected" as const },
    vercelBlob:
      vercelBlobHealth.status === "fulfilled"
        ? vercelBlobHealth.value
        : { status: "error" as const, message: "Vercel Blob error" },
  };
}
