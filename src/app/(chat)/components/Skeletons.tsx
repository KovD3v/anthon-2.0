"use client";

export function SidebarSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden animate-pulse">
      {/* New Chat Button Skeleton */}
      <div className="p-3">
        <div className="h-10 w-full rounded-lg bg-muted/50 border border-border/50" />
      </div>

      {/* Chat List Skeletons */}
      <div className="flex-1 space-y-2 p-2 pt-0">
        {["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
          >
            <div className="h-4 w-4 shrink-0 rounded-full bg-muted/40" />
            <div className="h-4 w-full rounded bg-muted/30" />
          </div>
        ))}
      </div>

      {/* Sidebar Bottom Skeleton */}
      <div className="p-3 mt-auto border-t border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted/50" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-2/3 rounded bg-muted/40" />
            <div className="h-2 w-1/2 rounded bg-muted/30" />
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
        <div
          key={key}
          className="h-32 rounded-xl bg-background/60 backdrop-blur-xl border border-white/10 shadow-xl"
        >
          <div className="p-6 space-y-3">
            <div className="h-4 w-24 rounded bg-muted/40" />
            <div className="h-8 w-16 rounded bg-muted/30" />
            <div className="h-3 w-32 rounded bg-muted/20" />
          </div>
        </div>
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
