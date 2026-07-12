"use client";

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

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82ca9d",
];

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

interface Props {
  usageStats: UsageStats | null;
  costStats: CostStats | null;
  funnelStats: FunnelStats | null;
}

export default function AnalyticsCharts({
  usageStats,
  costStats,
  funnelStats,
}: Props) {
  return (
    <>
      {/* Messages Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Messaggi nel tempo</CardTitle>
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
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Nuovi utenti nel tempo</CardTitle>
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
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Costi IA per modello</CardTitle>
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
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato sui costi disponibile
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Costi IA giornalieri</CardTitle>
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
                      "Costo",
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
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato sui costi disponibile
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Distribution & Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Distribuzione dei messaggi per utente</CardTitle>
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
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato sulla distribuzione
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Funnel di conversione (utenti registrati)</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelStats ? (
              <div className="space-y-4">
                <FunnelRow
                  label="Registrazione"
                  count={funnelStats.funnel.signup}
                  percentage={100}
                />
                <FunnelRow
                  label="Prima chat"
                  count={funnelStats.funnel.firstChat}
                  percentage={funnelStats.conversionRates.signupToFirstChat}
                />
                <FunnelRow
                  label="Terza sessione"
                  count={funnelStats.funnel.session3}
                  percentage={funnelStats.conversionRates.firstChatToSession3}
                />
                <FunnelRow
                  label="Passaggio di piano"
                  count={funnelStats.funnel.upgrade}
                  percentage={funnelStats.conversionRates.session3ToUpgrade}
                />
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Complessivo</span>
                    <span className="font-bold text-green-600">
                      {funnelStats.conversionRates.overall.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">
                      Tutti gli utenti
                    </span>
                    <span className="font-bold text-blue-600">
                      {funnelStats.funnel.signupAll}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">
                      Complessivo totale
                    </span>
                    <span className="font-bold text-indigo-600">
                      {funnelStats.conversionRates.overallAll.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                Nessun dato sul funnel
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
              <div className="text-sm text-muted-foreground">Costo totale</div>
              <div className="text-lg font-semibold">
                ${costStats.totalCostUsd.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Token di output totali
              </div>
              <div className="text-lg font-semibold">
                {costStats.totalOutputTokens.toLocaleString("it-IT")}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Costo medio per messaggio
              </div>
              <div className="text-lg font-semibold">
                ${costStats.avgCostPerMessage.toFixed(4)}
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Tempo medio di generazione
              </div>
              <div className="text-lg font-semibold">
                {costStats.avgGenerationTimeMs.toFixed(0)}ms
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
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
