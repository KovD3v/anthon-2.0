"use client";

import { Activity, DollarSign, Loader2, Mic, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

interface StatsData {
  subscription: {
    characterCount: number;
    characterLimit: number;
    nextResetUnix: number;
  } | null;
  systemLoad: number;
  stats: {
    today: { voiceMessages: number; characters: number; costUsd: number };
    week: { voiceMessages: number; characters: number; costUsd: number };
    month: { voiceMessages: number; characters: number; costUsd: number };
  };
  history: Array<{
    date: string;
    voiceMessages: number;
    charactersUsed: number;
  }>;
  channelBreakdown: Array<{
    channel: string;
    count: number;
    characters: number;
  }>;
}

function getLoadStatus(load: number): {
  color: string;
  label: string;
  emoji: string;
  textColor: string;
} {
  if (load > 0.6)
    return {
      color: "bg-emerald-500/10",
      textColor: "text-emerald-500",
      label: "Ottimale",
      emoji: "🟢",
    };
  if (load > 0.3)
    return {
      color: "bg-yellow-500/10",
      textColor: "text-yellow-500",
      label: "Moderato",
      emoji: "🟡",
    };
  return {
    color: "bg-red-500/10",
    textColor: "text-red-500",
    label: "Critico",
    emoji: "🔴",
  };
}

interface TooltipPayloadItem {
  value: number;
  name?: string;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-background/95 p-3 shadow-xl backdrop-blur-sm">
        <p className="mb-2 font-medium text-foreground">{label}</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-violet-500" />
            <span className="text-sm text-muted-foreground">Vocali:</span>
            <span className="font-mono font-medium text-foreground">
              {payload[0].value}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-muted-foreground">Caratteri:</span>
            <span className="font-mono font-medium text-foreground">
              {payload[1].value.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function ElevenLabsAdminPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/elevenlabs/stats");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-red-500">Errore</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-400">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const loadStatus = getLoadStatus(data.systemLoad);
  const usedPercent = data.subscription
    ? (data.subscription.characterCount / data.subscription.characterLimit) *
      100
    : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Voice Analytics
          </h1>
          <p className="text-muted-foreground">
            Monitoraggio in tempo reale della pipeline vocale
          </p>
        </div>
        {data.subscription && (
          <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm shadow-sm">
            <div
              className={`h-2 w-2 rounded-full ${
                usedPercent > 90
                  ? "bg-red-500"
                  : usedPercent > 75
                    ? "bg-yellow-500"
                    : "bg-emerald-500"
              }`}
            />
            <span className="font-medium text-foreground">
              {usedPercent.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">consumato</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Crediti Rimanenti
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.subscription?.characterCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              su {data.subscription?.characterLimit.toLocaleString()} totali
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-violet-500 transition-all duration-500"
                style={{
                  width: `${Math.min(usedPercent, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Load</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {(data.systemLoad * 100).toFixed(1)}%
              </div>
              <div
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${loadStatus.color} ${loadStatus.textColor}`}
              >
                {loadStatus.label}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Probabilità attuale di generazione vocale
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Oggi</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.stats.today.costUsd.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.stats.today.voiceMessages} messaggi generati
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Chart */}
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Andamento Attività</CardTitle>
          <CardDescription>
            Vocali generati e consumo caratteri (ultimi 14 giorni)
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.history}
                margin={{
                  top: 5,
                  right: 10,
                  left: 10,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="colorVoice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorChar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                    });
                  }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="voiceMessages"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorVoice)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="charactersUsed"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorChar)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Breakdown by Channel */}
        <Card>
          <CardHeader>
            <CardTitle>Canali</CardTitle>
            <CardDescription>
              Distribuzione del traffico per canale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.channelBreakdown.map((ch) => (
                <div
                  key={ch.channel}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Mic className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {ch.channel}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ch.characters.toLocaleString()} caratteri
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{ch.count}</p>
                    <p className="text-xs text-muted-foreground">messaggi</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Stats Table */}
        <Card>
          <CardHeader>
            <CardTitle>Statistiche Periodiche</CardTitle>
            <CardDescription>
              Confronto giornaliero, settimanale e mensile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                {
                  label: "Oggi",
                  data: data.stats.today,
                  color: "bg-blue-500",
                },
                {
                  label: "Questa Settimana",
                  data: data.stats.week,
                  color: "bg-violet-500",
                },
                {
                  label: "Questo Mese",
                  data: data.stats.month,
                  color: "bg-emerald-500",
                },
              ].map((period) => (
                <div key={period.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${period.color}`} />
                      <span className="text-sm font-medium">
                        {period.label}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ${period.data.costUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Messaggi
                      </div>
                      <div className="text-lg font-bold">
                        {period.data.voiceMessages}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Caratteri
                      </div>
                      <div className="text-lg font-bold">
                        {period.data.characters.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
