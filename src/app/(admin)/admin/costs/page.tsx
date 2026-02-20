"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  Cloud,
  Database,
  DollarSign,
  Layers,
  Loader2,
  MessageSquare,
  Mic,
  TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CostsCharts = dynamic(() => import("./_components/CostsCharts"), {
  ssr: false,
  loading: () => (
    <div className="h-87.5 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  ),
});

interface CostData {
  summary: {
    totalAiCost: number;
    totalVoiceCost: number;
    totalTokens: number;
    totalVoiceCharacters: number;
  };
  aiBreakdown: Array<{
    model: string;
    cost: number;
    count: number;
  }>;
  infrastructure: {
    [key: string]:
      | {
          current: number;
          nextTier: number;
          limit: string;
        }
      | {
          current: number;
          templateCostAvg: number;
        };
  };
  history: {
    ai: Array<{
      date: string;
      cost: number;
    }>;
  };
}

export default function AdminCostsPage() {
  const [range, setRange] = useState("30d");

  const { data, isLoading, isError } = useQuery<CostData>({
    queryKey: ["admin-costs", range],
    queryFn: () =>
      fetch(`/api/admin/costs?range=${range}`).then((res) => {
        if (!res.ok) throw new Error("Failed to fetch cost data");
        return res.json();
      }),
  });

  if (isLoading && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive/80">Failed to fetch cost data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const totalCost = data.summary.totalAiCost + data.summary.totalVoiceCost;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Analytics</h1>
          <p className="text-muted-foreground">
            Detailed breakdown of AI, Voice, and Infrastructure expenses.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-1 ring-1 ring-white/10 backdrop-blur-sm">
          {["7d", "30d", "90d", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                range === r
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* KPI Cards */}
        <div>
          <KPICard
            title="Total Estimated"
            value={`$${totalCost.toFixed(2)}`}
            description="Combined AI + Voice"
            icon={DollarSign}
            color="text-rose-500"
            bgColor="bg-rose-500/10"
          />
        </div>
        <div>
          <KPICard
            title="AI Intelligence"
            value={`$${data.summary.totalAiCost.toFixed(2)}`}
            description={`${data.summary.totalTokens.toLocaleString()} tokens`}
            icon={Brain}
            color="text-emerald-500"
            bgColor="bg-emerald-500/10"
          />
        </div>
        <div>
          <KPICard
            title="Vocal Synthesis"
            value={`$${data.summary.totalVoiceCost.toFixed(2)}`}
            description={`${data.summary.totalVoiceCharacters.toLocaleString()} chars`}
            icon={Mic}
            color="text-indigo-500"
            bgColor="bg-indigo-500/10"
          />
        </div>
        <div>
          <KPICard
            title="Infrastructure"
            value="Static"
            description="Fixed/Tier usage"
            icon={Layers}
            color="text-amber-500"
            bgColor="bg-amber-500/10"
          />
        </div>
      </div>

      <CostsCharts aiHistory={data.history.ai} aiBreakdown={data.aiBreakdown} />

      {/* Infrastructure Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <InfraCard
          name="Vercel"
          icon={Cloud}
          data={
            data.infrastructure.vercel as {
              current: number;
              limit: string;
            }
          }
          color="text-white"
        />
        <InfraCard
          name="Neon DB"
          icon={Database}
          data={
            data.infrastructure.neon as {
              current: number;
              limit: string;
            }
          }
          color="text-emerald-400"
        />
        <InfraCard
          name="Clerk Auth"
          icon={Activity}
          data={
            data.infrastructure.clerk as {
              current: number;
              limit: string;
            }
          }
          color="text-blue-400"
        />
        <InfraCard
          name="WhatsApp"
          icon={MessageSquare}
          data={
            data.infrastructure.whatsapp as {
              current: number;
              templateCostAvg: number;
            }
          }
          color="text-green-500"
        />
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  description,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="overflow-hidden border-white/5 bg-background/40 backdrop-blur-md shadow-lg group hover:bg-muted/30 transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300",
              bgColor,
            )}
          >
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">
            <TrendingUp className="h-3 w-3" />
            Active
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-2xl font-bold tracking-tight mt-1">{value}</h3>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {description}
          </p>
        </div>
      </CardContent>
      <div
        className={cn(
          "h-1 w-full bg-linear-to-r from-transparent to-transparent group-hover:from-transparent",
          color === "text-rose-500"
            ? "group-hover:to-rose-500/40"
            : color === "text-emerald-500"
              ? "group-hover:to-emerald-500/40"
              : color === "text-indigo-500"
                ? "group-hover:to-indigo-500/40"
                : "group-hover:to-amber-500/40",
        )}
      />
    </Card>
  );
}

function InfraCard({
  name,
  icon: Icon,
  data,
  color,
}: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  data: {
    current: number;
    nextTier?: number;
    limit?: string;
    templateCostAvg?: number;
  };
  color: string;
}) {
  return (
    <Card className="border-white/5 bg-background/40 backdrop-blur-md hover:bg-muted/20 transition-all duration-300 group">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/5 ring-1 ring-white/10 group-hover:ring-white/20 transition-all">
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-emerald-400 font-mono">
                ${data.current.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground">Current</span>
            </div>
          </div>
        </div>

        {data.limit && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Usage Limit</span>
              <span>Free Tier</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-linear-to-r from-primary/50 to-primary w-1/4" />
            </div>
            <p className="text-[10px] text-center text-muted-foreground/60 italic">
              {data.limit}
            </p>
          </div>
        )}

        {!data.limit && data.templateCostAvg && (
          <div className="mt-4 p-2 rounded bg-white/5 border border-white/5">
            <p className="text-[10px] text-muted-foreground">
              Avg. Template Cost:{" "}
              <span className="text-foreground font-mono font-medium">
                ${data.templateCostAvg}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
