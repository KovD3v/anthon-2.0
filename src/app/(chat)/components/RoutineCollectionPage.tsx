"use client";

import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ListChecks,
  Loader2,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoutineCardData } from "@/lib/coaching/routine";
import type { RoutineCollectionStatus } from "@/lib/coaching/routine-client";
import { cn } from "@/lib/utils";
import { getRoutineCheckInHref, useChatContext } from "../chat/layout-client";

type CollectionFilter = RoutineCollectionStatus;

function getRoutineStateLabel(routine: RoutineCardData) {
  if (routine.status === "ARCHIVED") return "Archiviata";
  if (routine.latestAttempt?.outcome === null) return "Check-in da completare";
  if (routine.latestAttempt?.outcome) return "Esito registrato";
  return "Pronta da provare";
}

function getRoutineCountLabel(count: number | null, status: CollectionFilter) {
  if (count === null) return "";
  if (status === "ACTIVE") {
    return `${count} ${count === 1 ? "attiva" : "attive"}`;
  }
  return `${count} ${count === 1 ? "archiviata" : "archiviate"}`;
}

function RoutineCollectionCard({
  routine,
  onOpen,
}: {
  routine: RoutineCardData;
  onOpen: (routine: RoutineCardData) => void;
}) {
  const stateLabel = getRoutineStateLabel(routine);
  const href = getRoutineCheckInHref(routine);

  return (
    <Link
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onOpen(routine);
      }}
      className="group flex min-h-11 items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 outline-none transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/30 hover:bg-card hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none md:grid md:grid-cols-[minmax(0,1fr)_auto] md:gap-6 md:p-5"
      aria-label={`${routine.proposal.title}, ${stateLabel}`}
      data-testid={`routine-card-${routine.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {routine.status === "ARCHIVED" ? (
            <Archive
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ListChecks
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
          )}
          <h2 className="truncate text-base font-semibold tracking-tight md:text-lg">
            {routine.proposal.title}
          </h2>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {routine.proposal.trigger}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {routine.proposal.durationLabel ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {routine.proposal.durationLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {stateLabel}
          </span>
        </div>
      </div>
      <span className="hidden shrink-0 text-sm font-medium text-primary md:inline-flex md:items-center md:gap-1">
        Apri check-in
        <ArrowLeft className="size-4 rotate-180" aria-hidden="true" />
      </span>
      <span className="ml-auto shrink-0 text-xs font-medium text-primary md:hidden">
        Apri
      </span>
    </Link>
  );
}

export function RoutineCollectionPage() {
  const {
    isGuest,
    routineCollection,
    routineCollectionError,
    isRoutineCollectionLoading,
    routineCollectionLoadingMoreStatus,
    refreshRoutineCollection,
    loadMoreRoutineCollection,
    navigateToRoutine,
  } = useChatContext();
  const [filter, setFilter] = useState<CollectionFilter>("ACTIVE");

  const visibleRoutines = useMemo(
    () =>
      routineCollection.routines.filter((routine) => routine.status === filter),
    [filter, routineCollection.routines],
  );
  const segment =
    filter === "ACTIVE" ? routineCollection.active : routineCollection.archived;
  const countLabel = getRoutineCountLabel(segment.total, filter);
  const isLoadingMore = routineCollectionLoadingMoreStatus === filter;

  if (isGuest) {
    return (
      <section
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 md:py-12"
        aria-labelledby="routine-collection-title"
      >
        <div className="flex items-center gap-3">
          <ListChecks className="size-5 text-primary" aria-hidden="true" />
          <h1 id="routine-collection-title" className="text-2xl font-semibold">
            Le tue routine
          </h1>
        </div>
        <div className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-6 text-center shadow-sm">
          <p className="text-sm leading-6 text-muted-foreground">
            Registrati per salvare e ritrovare le tue routine.
          </p>
          <Button asChild className="mt-5 min-h-11">
            <Link
              href={`/sign-up?redirect_url=${encodeURIComponent("/chat/routines")}`}
            >
              Registrati
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 md:py-10"
      aria-labelledby="routine-collection-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/chat"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Torna alla chat
          </Link>
          <div className="mt-5 flex items-center gap-3">
            <ListChecks className="size-5 text-primary" aria-hidden="true" />
            <h1
              id="routine-collection-title"
              className="text-2xl font-semibold tracking-tight md:text-3xl"
            >
              Le tue routine
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Ritrova i reset che hai scelto e torna al prossimo tentativo quando
            ti serve.
          </p>
        </div>
        <fieldset className="flex w-full gap-2 rounded-xl border border-border/70 bg-muted/30 p-1 sm:w-auto">
          <legend className="sr-only">Filtro routine</legend>
          {(["ACTIVE", "ARCHIVED"] as const).map((status) => {
            const isSelected = filter === status;
            const label = status === "ACTIVE" ? "Attive" : "Archiviate";
            const total =
              status === "ACTIVE"
                ? routineCollection.active.total
                : routineCollection.archived.total;
            return (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={isSelected ? "secondary" : "ghost"}
                className={cn(
                  "min-h-11 flex-1 px-3 text-sm sm:flex-none",
                  isSelected && "shadow-sm",
                )}
                aria-pressed={isSelected}
                onClick={() => setFilter(status)}
              >
                {label}
                {total !== null ? ` (${total})` : ""}
              </Button>
            );
          })}
        </fieldset>
      </header>

      {isRoutineCollectionLoading ? (
        <p
          className="mt-8 flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Aggiornamento routine in corso…
        </p>
      ) : null}

      {routineCollectionError ? (
        <div
          className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <span>Routine non disponibili. Riprova tra poco.</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void refreshRoutineCollection()}
          >
            <RotateCw className="mr-2 size-4" aria-hidden="true" />
            Riprova
          </Button>
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filter === "ACTIVE" ? "Routine attive" : "Storico routine"}
        </h2>
        {countLabel ? (
          <span className="text-xs text-muted-foreground">{countLabel}</span>
        ) : null}
      </div>

      {visibleRoutines.length > 0 ? (
        <div className="mt-3 grid gap-3">
          {visibleRoutines.map((routine) => (
            <RoutineCollectionCard
              key={routine.id}
              routine={routine}
              onOpen={navigateToRoutine}
            />
          ))}
        </div>
      ) : !isRoutineCollectionLoading ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
          <p className="text-sm font-medium">
            {filter === "ACTIVE"
              ? "Non hai ancora una routine attiva"
              : "Non hai routine archiviate"}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {filter === "ACTIVE"
              ? "Chiedi ad Anthon di costruire un reset pratico per il tuo prossimo momento importante."
              : "Le routine archiviate resteranno qui come storico dei tuoi tentativi."}
          </p>
        </div>
      ) : null}

      {segment.nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="mt-5 min-h-11 self-center px-5"
          disabled={isLoadingMore}
          onClick={() => void loadMoreRoutineCollection(filter)}
        >
          {isLoadingMore ? (
            <>
              <Loader2
                className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Caricamento routine…
            </>
          ) : (
            "Carica altre routine"
          )}
        </Button>
      ) : null}
    </section>
  );
}
