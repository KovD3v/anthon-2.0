"use client";

import { Clock3, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { UsageData, UsageTier } from "@/types/chat";

const tierLabels: Record<UsageTier, string> = {
  GUEST: "Ospite",
  TRIAL: "Prova",
  BASIC: "Basic",
  BASIC_PLUS: "Basic Plus",
  PRO: "Pro",
  ADMIN: "Admin",
};

function timeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const minutes = Math.max(
    0,
    Math.ceil((midnight.getTime() - now.getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

export function UsageSection() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [countdown, setCountdown] = useState(timeUntilMidnight);

  useEffect(() => {
    let active = true;

    async function loadUsage() {
      try {
        const response = await fetch("/api/usage", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load usage");

        const usageData = (await response.json()) as UsageData;
        if (!active) return;

        setData(usageData);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUsage();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(
      () => setCountdown(timeUntilMidnight()),
      60_000,
    );

    return () => window.clearInterval(interval);
  }, []);

  const used = data?.usage.requestCount ?? 0;
  const limit = data?.limits.maxRequests ?? 0;
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const progressValue = limit > 0 ? Math.min(used, limit) : 0;
  const canUpgrade = data?.tier !== "PRO" && data?.tier !== "ADMIN";

  return (
    <Card
      id="utilizzo"
      className="scroll-mt-6 overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm"
    >
      <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
        <h2 className="text-lg font-semibold">Utilizzo</h2>
        <p className="text-sm text-muted-foreground">
          Il riepilogo del tuo piano e dei messaggi di oggi
        </p>
      </div>

      {loading ? (
        <div className="space-y-5 px-6 py-5">
          <span className="sr-only">Caricamento utilizzo</span>
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-44 animate-pulse rounded bg-muted" />
        </div>
      ) : failed || !data ? (
        <div className="px-6 py-5" role="alert">
          <p className="text-sm font-medium">
            Impossibile caricare l&apos;utilizzo.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Riprova tra qualche istante.
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Piano attuale
              </p>
              <p className="mt-1 text-sm font-semibold">
                {tierLabels[data.tier]}
              </p>
            </div>
            {canUpgrade ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/pricing">Vedi i piani</Link>
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareText className="h-4 w-4 text-primary" />
                Messaggi di oggi
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {remaining} rimasti su {limit}
              </span>
            </div>
            <Progress
              aria-label="Messaggi utilizzati"
              aria-valuemax={limit}
              aria-valuemin={0}
              aria-valuenow={progressValue}
              aria-valuetext={`${used} messaggi utilizzati su ${limit}`}
              value={percentage}
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {used} utilizzati
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-border/50 pt-4 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>Si azzera a mezzanotte, tra {countdown}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
