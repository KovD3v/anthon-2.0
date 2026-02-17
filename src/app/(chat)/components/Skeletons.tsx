"use client";

import { Card } from "@/components/ui/card";

export function SidebarSkeleton() {
  const chatRows = [
    { id: "c1", width: "w-32", active: true },
    { id: "c2", width: "w-24", active: false },
    { id: "c3", width: "w-36", active: false },
    { id: "c4", width: "w-28", active: false },
    { id: "c5", width: "w-20", active: false },
    { id: "c6", width: "w-32", active: false },
  ] as const;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-md dark:border-white/10 dark:bg-background/40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/45 ring-1 ring-border/70" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted/35" />
        </div>
        <div className="h-8 w-8 animate-pulse rounded-md bg-muted/30" />
      </div>

      <div className="p-3">
        <div className="h-10 w-full animate-pulse rounded-lg border border-border/50 bg-muted/30 dark:border-white/10" />
      </div>

      <div className="flex-1 space-y-1 overflow-hidden p-2 pt-0">
        {chatRows.map((row) => (
          <div
            key={row.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
              row.active
                ? "bg-accent ring-1 ring-border/60 dark:bg-white/10 dark:ring-white/10"
                : ""
            }`}
          >
            <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted/40" />
            <div
              className={`h-3 animate-pulse rounded bg-muted/35 ${row.width}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-border/50 p-3 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted/45" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/35" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function KPIStatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 animate-pulse">
      {["k1", "k2", "k3", "k4", "k5"].map((key) => (
        <Card key={key} variant="glass" className="h-32">
          <div className="p-6 space-y-3">
            <div className="h-4 w-24 rounded bg-muted/40" />
            <div className="h-8 w-16 rounded bg-muted/30" />
            <div className="h-3 w-32 rounded bg-muted/20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SystemStatusSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {["st1", "st2", "st3", "st4"].map((key) => (
        <div key={key} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-muted/40" />
            <div className="h-4 w-24 rounded bg-muted/30" />
          </div>
          <div className="h-5 w-20 rounded-full bg-muted/20" />
        </div>
      ))}
    </div>
  );
}
