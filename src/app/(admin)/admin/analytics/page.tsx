"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";

const AnalyticsCharts = dynamic(
  () => import("./_components/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    ),
  },
);

interface UsageStats {
  messagesByDay: Array<{ date: string; count: number }>;
  usersByDay: Array<{ date: string; count: number }>;
  messageDistribution: Array<{ range: string; count: number }>;
  activeUsersInPeriod: number;
}

interface CostStats {
  totalCostUsd: number;
  totalOutputTokens: number;
  avgCostPerMessage: number;
  avgGenerationTimeMs: number;
  costByModel: Array<{ model: string; cost: number; messageCount: number }>;
  costByDay: Array<{ date: string; cost: number }>;
}

interface FunnelStats {
  funnel: {
    signup: number;
    firstChat: number;
    session3: number;
    upgrade: number;
    signupAll: number;
    firstChatAll: number;
    session3All: number;
    upgradeAll: number;
  };
  conversionRates: {
    signupToFirstChat: number;
    firstChatToSession3: number;
    session3ToUpgrade: number;
    overall: number;
    signupToFirstChatAll: number;
    firstChatToSession3All: number;
    session3ToUpgradeAll: number;
    overallAll: number;
  };
}

type TimeRange = "7d" | "30d" | "90d" | "all";

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>("30d");

  const { data, isLoading } = useQuery<{
    usage: UsageStats | null;
    costs: CostStats | null;
    funnel: FunnelStats | null;
  }>({
    queryKey: ["analytics", range],
    queryFn: async () => {
      const [usageRes, costRes, funnelRes] = await Promise.all([
        fetch(`/api/admin/analytics?type=usage&range=${range}`),
        fetch(`/api/admin/analytics?type=costs&range=${range}`),
        fetch(`/api/admin/analytics?type=funnel&range=${range}`),
      ]);
      return {
        usage: usageRes.ok ? await usageRes.json() : null,
        costs: costRes.ok ? await costRes.json() : null,
        funnel: funnelRes.ok ? await funnelRes.json() : null,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            Detailed usage and engagement metrics
          </p>
        </div>

        <div className="flex gap-2">
          {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 backdrop-blur-md text-muted-foreground hover:bg-background/80 border border-white/10"
              }`}
            >
              {r === "all"
                ? "All Time"
                : r === "7d"
                  ? "7 Days"
                  : r === "30d"
                    ? "30 Days"
                    : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      <AnalyticsCharts
        usageStats={data?.usage ?? null}
        costStats={data?.costs ?? null}
        funnelStats={data?.funnel ?? null}
      />
    </div>
  );
}
