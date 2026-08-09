"use client";

import { ListChecks, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RoutineCardData } from "@/lib/coaching/routine";

export function RoutineSidebarShelf({
  routines,
  activeTotal = null,
  isLoading,
  error,
  onRetry,
}: {
  routines: RoutineCardData[];
  activeTotal?: number | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const activeCount =
    activeTotal ?? routines.filter((routine) => routine.status === "ACTIVE").length;
  const activeLabel = `${activeCount} ${activeCount === 1 ? "attiva" : "attive"}`;

  return (
    <section
      aria-label="Routine"
      className="shrink-0 border-t border-border/50 bg-background/80 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-background/40"
      data-testid="routine-sidebar-shelf"
    >
      <Link
        href="/chat/routines"
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        aria-label={`Routine, ${activeLabel}`}
      >
        <ListChecks
          className="size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Routine
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {activeLabel}
        </span>
      </Link>
      {isLoading ? (
        <p className="sr-only" aria-live="polite">
          Aggiornamento routine in corso
        </p>
      ) : null}
      {error ? (
        <div className="mt-1 flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
          <span>Routine non disponibili</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 px-1.5 text-xs"
            onClick={onRetry}
            aria-label="Riprova routine"
          >
            <RotateCw className="mr-1 size-3" /> Riprova
          </Button>
        </div>
      ) : null}
    </section>
  );
}
