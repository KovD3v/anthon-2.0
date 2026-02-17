"use client";

import { ArrowLeft, Clock, MessageSquare, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UsageData } from "@/types/chat";

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch(`/api/usage?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch usage:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const ms = tomorrow.getTime() - now.getTime();
      const h = Math.floor(ms / (1000 * 60 * 60));
      const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${h}h ${m}m`);
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  const getTierLabel = () => {
    if (!data) return "";
    if (data.tier === "ADMIN") return "Admin";
    if (data.subscriptionStatus === "ACTIVE") return "Pro";
    if (data.subscriptionStatus === "TRIAL") return "Prova";
    return "Free";
  };

  const used = data?.usage.requestCount ?? 0;
  const max = data?.limits.maxRequests ?? 0;
  const remaining = Math.max(0, max - used);
  const percent = max > 0 ? Math.min((used / max) * 100, 100) : 0;

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-md px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 gap-1.5"
            asChild
          >
            <Link href="/chat">
              <ArrowLeft className="h-4 w-4" />
              Torna alla chat
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Il tuo utilizzo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Piano{" "}
            <span className="font-medium text-primary">{getTierLabel()}</span>
          </p>
        </div>

        {loading ? (
          <Card variant="glass" className="h-48 animate-pulse" />
        ) : data ? (
          <div className="space-y-4">
            {/* Main message card */}
            <Card variant="glass" className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Messaggi di oggi
                  </p>
                </div>
              </div>

              {/* Big number */}
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-foreground">
                  {remaining}
                </span>
                <span className="text-sm text-muted-foreground">
                  rimasti su {max}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50 mb-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    percent >= 90
                      ? "bg-red-500"
                      : percent >= 70
                        ? "bg-amber-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>

              <p className="text-xs text-muted-foreground text-right">
                {used} utilizzati
              </p>
            </Card>

            {/* Reset countdown */}
            <Card variant="glass" className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Reset a mezzanotte
                  </span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  tra {countdown}
                </span>
              </div>
            </Card>

            {/* Upgrade CTA */}
            {data.subscriptionStatus !== "ACTIVE" && data.tier !== "ADMIN" && (
              <Card variant="glass" className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Vuoi più messaggi?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Passa a Pro per sbloccare limiti più alti
                      </p>
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link href="/pricing">Upgrade</Link>
                  </Button>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card variant="glass" className="p-8 text-center">
            <p className="text-muted-foreground">
              Impossibile caricare i dati di utilizzo.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
