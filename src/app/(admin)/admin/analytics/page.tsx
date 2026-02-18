"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82ca9d",
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [costStats, setCostStats] = useState<CostStats | null>(null);
  const [funnelStats, setFunnelStats] = useState<FunnelStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [usageRes, costRes, funnelRes] = await Promise.all([
          fetch(`/api/admin/analytics?type=usage&range=${range}`),
          fetch(`/api/admin/analytics?type=costs&range=${range}`),
          fetch(`/api/admin/analytics?type=funnel&range=${range}`),
        ]);

        if (usageRes.ok) setUsageStats(await usageRes.json());
        if (costRes.ok) setCostStats(await costRes.json());
        if (funnelRes.ok) setFunnelStats(await funnelRes.json());
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [range]);

  if (loading) {
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

      {/* Messages Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Messages Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {usageStats?.messagesByDay &&
            usageStats.messagesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={usageStats.messagesByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                      })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT")
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#0088FE"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>New Users Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {usageStats?.usersByDay && usageStats.usersByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={usageStats.usersByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                      })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT")
                    }
                  />
                  <Bar dataKey="count" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>AI Costs by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {costStats?.costByModel && costStats.costByModel.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={costStats.costByModel}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${(name as string)?.split("/")[1] || name} (${(
                        (percent ?? 0) * 100
                      ).toFixed(0)}%)`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="cost"
                    nameKey="model"
                  >
                    {costStats.costByModel.map((_, index) => (
                      <Cell
                        key={`cell-${index + 1}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string | undefined) =>
                      `$${Number(value || 0).toFixed(4)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No cost data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Daily AI Costs</CardTitle>
          </CardHeader>
          <CardContent>
            {costStats?.costByDay && costStats.costByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={costStats.costByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                      })
                    }
                  />
                  <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip
                    labelFormatter={(v) =>
                      new Date(v).toLocaleDateString("it-IT")
                    }
                    formatter={(value: number | string | undefined) => [
                      `$${Number(value || 0).toFixed(4)}`,
                      "Cost",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#FF8042"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No cost data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Distribution & Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>User Message Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {usageStats?.messageDistribution &&
            usageStats.messageDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={usageStats.messageDistribution}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="range" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884D8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No distribution data
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Conversion Funnel (Registered)</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelStats ? (
              <div className="space-y-4">
                <FunnelRow
                  label="Signup"
                  count={funnelStats.funnel.signup}
                  percentage={100}
                />
                <FunnelRow
                  label="First Chat"
                  count={funnelStats.funnel.firstChat}
                  percentage={funnelStats.conversionRates.signupToFirstChat}
                />
                <FunnelRow
                  label="Session 3"
                  count={funnelStats.funnel.session3}
                  percentage={funnelStats.conversionRates.firstChatToSession3}
                />
                <FunnelRow
                  label="Upgrade"
                  count={funnelStats.funnel.upgrade}
                  percentage={funnelStats.conversionRates.session3ToUpgrade}
                />
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall</span>
                    <span className="font-bold text-green-600">
                      {funnelStats.conversionRates.overall.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">All users</span>
                    <span className="font-bold text-blue-600">
                      {funnelStats.funnel.signupAll}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">All overall</span>
                    <span className="font-bold text-indigo-600">
                      {funnelStats.conversionRates.overallAll.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No funnel data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Summary Cards */}
      {costStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Cost</div>
              <div className="text-2xl font-bold">
                ${costStats.totalCostUsd.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Total Output Tokens
              </div>
              <div className="text-2xl font-bold">
                {costStats.totalOutputTokens.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Avg Cost/Message
              </div>
              <div className="text-2xl font-bold">
                ${costStats.avgCostPerMessage.toFixed(4)}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Avg Generation Time
              </div>
              <div className="text-2xl font-bold">
                {costStats.avgGenerationTimeMs.toFixed(0)}ms
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function FunnelRow({
  label,
  count,
  percentage,
}: {
  label: string;
  count: number;
  percentage: number;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{count}</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
