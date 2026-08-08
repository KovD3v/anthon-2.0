"use client";

import { ChevronUp, Clock3, ListChecks, RotateCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoutineCardData } from "@/lib/coaching/routine";

function getRoutineHref(routine: RoutineCardData) {
  const query = new URLSearchParams({
    checkInRoutineId: routine.id,
  }).toString();

  if (routine.sourceChatId && routine.sourceAssistantMessageId) {
    return `/chat/${encodeURIComponent(routine.sourceChatId)}?${query}`;
  }

  return `/chat?${query}`;
}

function getStatusLabel(routine: RoutineCardData) {
  if (routine.status === "ARCHIVED") return "Archiviata";
  if (routine.latestAttempt?.outcome === null) return "Check-in da completare";
  return "Attiva";
}

export function RoutineSidebarShelf({
  routines,
  isLoading,
  error,
  onRetry,
  onNavigate,
}: {
  routines: RoutineCardData[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (routine: RoutineCardData) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const activeRoutines = useMemo(
    () => routines.filter((routine) => routine.status === "ACTIVE"),
    [routines],
  );
  const archivedRoutines = useMemo(
    () => routines.filter((routine) => routine.status === "ARCHIVED"),
    [routines],
  );
  const visibleRoutines = showArchived ? archivedRoutines : activeRoutines;
  const latestRoutine = activeRoutines[0] ?? archivedRoutines[0] ?? null;
  const activeLabel = `${activeRoutines.length} ${
    activeRoutines.length === 1 ? "attiva" : "attive"
  }`;

  return (
    <section
      aria-label="Routine"
      className="relative shrink-0 border-t border-border/50 bg-background/80 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-background/40"
      data-testid="routine-sidebar-shelf"
    >
      {isExpanded ? (
        <div className="absolute inset-x-0 bottom-full z-10 max-h-[min(24rem,calc(100dvh-13rem))] overflow-hidden border-y border-border/50 bg-background/95 p-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-muted/95">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Le tue routine</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setIsExpanded(false)}
              aria-label="Riduci routine"
            >
              Riduci
            </Button>
          </div>
          <div
            className="mb-2 flex gap-1"
            role="tablist"
            aria-label="Filtro routine"
          >
            <Button
              type="button"
              variant={showArchived ? "ghost" : "secondary"}
              size="sm"
              className="h-7 px-2 text-xs"
              aria-pressed={!showArchived}
              onClick={() => setShowArchived(false)}
            >
              Attive
            </Button>
            <Button
              type="button"
              variant={showArchived ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              aria-pressed={showArchived}
              onClick={() => setShowArchived(true)}
            >
              Archiviate
            </Button>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {visibleRoutines.length > 0 ? (
              visibleRoutines.map((routine) => (
                <Link
                  className="block rounded-lg px-2 py-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  href={getRoutineHref(routine)}
                  key={routine.id}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(routine);
                  }}
                >
                  <span className="block truncate font-medium">
                    {routine.proposal.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3" />
                    {routine.proposal.durationLabel ?? getStatusLabel(routine)}
                    <span aria-hidden="true">·</span>
                    {getStatusLabel(routine)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {showArchived
                  ? "Nessuna routine archiviata"
                  : "Nessuna routine attiva"}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <ListChecks
          className="size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">Routine</span>
            <span className="text-xs text-muted-foreground">{activeLabel}</span>
          </div>
          {latestRoutine ? (
            <p className="truncate text-xs text-muted-foreground">
              <span>{latestRoutine.proposal.title}</span>
              {latestRoutine.proposal.durationLabel
                ? ` · ${latestRoutine.proposal.durationLabel}`
                : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nessuna routine salvata
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-label={isExpanded ? "Riduci routine" : "Espandi routine"}
        >
          <ChevronUp
            className={`size-4 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </Button>
      </div>
      {isLoading ? (
        <p className="sr-only">Aggiornamento routine in corso</p>
      ) : null}
      {error ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Routine non disponibili</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs"
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
