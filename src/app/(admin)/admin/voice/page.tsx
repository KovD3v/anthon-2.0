"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, DollarSign, Loader2, Mic, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const VoiceCharts = dynamic(() => import("./_components/VoiceCharts"), {
  ssr: false,
  loading: () => (
    <div className="h-87.5 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  ),
});

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

export default function ElevenLabsAdminPage() {
  const { data, isLoading, isError, error } = useQuery<StatsData>({
    queryKey: ["voice-admin-stats"],
    queryFn: () =>
      fetch("/api/admin/elevenlabs/stats").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-red-500">Errore</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-400">
              {error instanceof Error ? error.message : "Failed to fetch"}
            </p>
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

      <VoiceCharts history={data.history} />

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
