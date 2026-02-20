"use client";

import { m } from "framer-motion";
import { Brain, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const COLORS = ["#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#3b82f6"];

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

interface CostsChartsProps {
  aiHistory: Array<{ date: string; cost: number }>;
  aiBreakdown: Array<{ model: string; cost: number; count: number }>;
}

export default function CostsCharts({
  aiHistory,
  aiBreakdown,
}: CostsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* History Chart */}
      <m.div
        variants={item}
        initial="hidden"
        animate="show"
        className="lg:col-span-2"
      >
        <Card className="h-full border-white/5 bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Cost History
            </CardTitle>
            <CardDescription>Daily AI expenditure over time</CardDescription>
          </CardHeader>
          <CardContent className="h-75 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aiHistory}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.1)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) =>
                    new Date(val).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  stroke="rgba(255,255,255,0.1)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border border-white/10 bg-background/90 p-3 shadow-xl backdrop-blur-md">
                          <p className="text-xs text-muted-foreground mb-1">
                            {new Date(
                              payload[0].payload.date,
                            ).toLocaleDateString()}
                          </p>
                          <p className="text-sm font-bold text-primary">
                            ${Number(payload[0].value).toFixed(4)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCost)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </m.div>

      {/* Model Breakdown */}
      <m.div variants={item} initial="hidden" animate="show">
        <Card className="h-full border-white/5 bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-emerald-500" />
              Model Distribution
            </CardTitle>
            <CardDescription>AI cost by model provider</CardDescription>
          </CardHeader>
          <CardContent className="h-75 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={aiBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="cost"
                  nameKey="model"
                >
                  {aiBreakdown.map((entry, index) => (
                    <Cell
                      key={entry.model}
                      fill={COLORS[index % COLORS.length]}
                      stroke="rgba(255,255,255,0.05)"
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border border-white/10 bg-background/90 p-2 shadow-xl backdrop-blur-md">
                          <p className="text-xs font-semibold">
                            {payload[0].name}
                          </p>
                          <p className="text-xs text-primary">
                            ${Number(payload[0].value).toFixed(4)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full mt-4 px-2">
              {aiBreakdown.map((entry, i) => (
                <div key={entry.model} className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground truncate max-w-20">
                    {entry.model}
                  </span>
                  <span className="text-[10px] font-mono ml-auto">
                    ${entry.cost.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
