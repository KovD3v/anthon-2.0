"use client";

import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ListChecks,
  Loader2,
  MessageCircle,
  Pencil,
  RotateCw,
  Repeat2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import {
  normalizeRoutineProposal,
  type RoutineCardData,
} from "@/lib/coaching/routine";
import {
  archiveRoutine,
  createRoutineAttempt,
  RoutineClientError,
  saveRoutineOutcome,
  type RoutineAttemptOutcome,
  type RoutineCollectionStatus,
} from "@/lib/coaching/routine-client";
import { cn } from "@/lib/utils";
import { useChatContext } from "../chat/layout-client";
import {
  type CreateRoutineAttempt,
  RoutineCheckInForm,
  type SaveRoutineOutcome,
} from "./RoutineCheckInForm";
import { RoutineHistory } from "./RoutineHistory";

type CollectionFilter = RoutineCollectionStatus;
type CollectionAction = "repeat" | "adapt" | "check-in" | "archive" | null;

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

function formatActionError(cause: unknown, fallback: string) {
  return cause instanceof RoutineClientError ? cause.message : fallback;
}

function createClientActionId(routineId: string) {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${routineId}:collection:${randomId}`;
}

function RoutineCollectionCard({
  routine,
  onCreateRoutineChat,
  onCreateAttempt,
  onSaveOutcome,
  onArchive,
}: {
  routine: RoutineCardData;
  onCreateRoutineChat: (
    routine: RoutineCardData,
    mode: "repeat" | "adapt",
  ) => Promise<string | null>;
  onCreateAttempt: CreateRoutineAttempt;
  onSaveOutcome: SaveRoutineOutcome;
  onArchive: (routine: RoutineCardData) => Promise<RoutineCardData | null>;
}) {
  const [displayedRoutine, setDisplayedRoutine] =
    useState<RoutineCardData>(routine);
  const [pendingAction, setPendingAction] = useState<CollectionAction>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayedRoutine(routine);
    if (routine.latestAttempt?.outcome !== null) {
      setIsCheckInOpen(false);
    }
  }, [routine]);

  const normalized = normalizeRoutineProposal(displayedRoutine.proposal);
  const isArchived = displayedRoutine.status === "ARCHIVED";
  const hasPendingAttempt = displayedRoutine.latestAttempt?.outcome === null;
  const stateLabel = getRoutineStateLabel(displayedRoutine);

  async function startNewChat(mode: "repeat" | "adapt") {
    if (pendingAction) return;
    setPendingAction(mode);
    setError(null);
    try {
      const chatId = await onCreateRoutineChat(displayedRoutine, mode);
      if (!chatId) {
        setError("Non siamo riusciti ad aprire una nuova chat. Riprova.");
      }
    } catch (cause) {
      setError(
        formatActionError(
          cause,
          "Non siamo riusciti ad aprire una nuova chat. Riprova.",
        ),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function openCheckIn() {
    if (pendingAction) return;
    setPendingAction("check-in");
    setError(null);
    try {
      const nextRoutine = hasPendingAttempt
        ? displayedRoutine
        : await onCreateAttempt(displayedRoutine.id, undefined, undefined);
      setDisplayedRoutine(nextRoutine);
      setIsCheckInOpen(true);
    } catch (cause) {
      setError(
        formatActionError(
          cause,
          "Non siamo riusciti ad aprire il check-in. Riprova.",
        ),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function saveOutcome(
    attemptId: string,
    outcome: RoutineAttemptOutcome,
    outcomeNote?: string | null,
  ) {
    const nextRoutine = await onSaveOutcome(attemptId, outcome, outcomeNote);
    setDisplayedRoutine(nextRoutine);
    return nextRoutine;
  }

  async function archive() {
    if (pendingAction) return;
    setPendingAction("archive");
    setError(null);
    try {
      const archived = await onArchive(displayedRoutine);
      if (archived) setDisplayedRoutine(archived);
    } catch (cause) {
      setError(
        formatActionError(
          cause,
          "Non siamo riusciti ad archiviare la routine. Riprova.",
        ),
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <article
      className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-xs sm:p-5"
      aria-labelledby={`routine-title-${displayedRoutine.id}`}
      data-testid={`routine-card-${displayedRoutine.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isArchived ? (
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
            <h2
              id={`routine-title-${displayedRoutine.id}`}
              className="truncate text-base font-semibold tracking-tight md:text-lg"
            >
              {normalized.title}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {normalized.trigger}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {stateLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {normalized.durationLabel ? (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {normalized.durationLabel}
          </span>
        ) : null}
        <span>{normalized.practiceSteps.length} passaggi</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!isArchived && (
          <Button
            type="button"
            size="sm"
            className="min-h-11 rounded-full px-4"
            disabled={pendingAction !== null}
            onClick={() => void startNewChat("repeat")}
          >
            {pendingAction === "repeat" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Repeat2 className="size-3.5" aria-hidden="true" />
            )}
            Ripeti
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 rounded-full px-4"
          disabled={pendingAction !== null}
          onClick={() => void startNewChat("adapt")}
        >
          {pendingAction === "adapt" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Pencil className="size-3.5" aria-hidden="true" />
          )}
          Modifica
        </Button>
        {!isArchived && (
          <Button
            type="button"
            size="sm"
            variant={hasPendingAttempt ? "default" : "outline"}
            className="min-h-11 rounded-full px-4"
            disabled={pendingAction !== null}
            onClick={() => void openCheckIn()}
          >
            {pendingAction === "check-in" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="size-3.5" aria-hidden="true" />
            )}
            {hasPendingAttempt ? "Completa check-in" : "Com'è andata?"}
          </Button>
        )}
        {!isArchived && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 rounded-full px-4 text-muted-foreground hover:text-destructive"
            disabled={pendingAction !== null}
            onClick={() => void archive()}
          >
            {pendingAction === "archive" && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            Archivia
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isCheckInOpen && (
        <RoutineCheckInForm
          routine={displayedRoutine}
          onCreateAttempt={onCreateAttempt}
          onSaveOutcome={saveOutcome}
          onSuccess={(nextRoutine) => {
            setDisplayedRoutine(nextRoutine);
            setIsCheckInOpen(false);
          }}
        />
      )}

      <RoutineHistory routine={displayedRoutine} />
    </article>
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
    createRoutineChat,
  } = useChatContext();
  const [filter, setFilter] = useState<CollectionFilter>("ACTIVE");
  const { confirm, isOpen, options, handleConfirm, handleCancel, setIsOpen } =
    useConfirm();

  const visibleRoutines = useMemo(
    () =>
      routineCollection.routines.filter((routine) => routine.status === filter),
    [filter, routineCollection.routines],
  );
  const segment =
    filter === "ACTIVE" ? routineCollection.active : routineCollection.archived;
  const countLabel = getRoutineCountLabel(segment.total, filter);
  const isLoadingMore = routineCollectionLoadingMoreStatus === filter;

  async function handleCreateAttempt(
    routineId: string,
    _outcome?: RoutineAttemptOutcome,
    _outcomeNote?: string | null,
  ) {
    const nextRoutine = await createRoutineAttempt(
      routineId,
      createClientActionId(routineId),
    );
    await refreshRoutineCollection();
    return nextRoutine;
  }

  async function handleSaveOutcome(
    attemptId: string,
    outcome: RoutineAttemptOutcome,
    outcomeNote?: string | null,
  ) {
    const nextRoutine = await saveRoutineOutcome(
      attemptId,
      outcome,
      outcomeNote,
    );
    await refreshRoutineCollection();
    return nextRoutine;
  }

  async function handleArchive(routine: RoutineCardData) {
    const confirmed = await confirm({
      title: "Archiviare questa routine?",
      description:
        "La routine resterà nello storico e potrai usarla come base per una nuova chat.",
      confirmText: "Archivia routine",
      cancelText: "Annulla",
      variant: "destructive",
    });
    if (!confirmed) return null;

    const archived = await archiveRoutine(routine.id);
    await refreshRoutineCollection();
    return archived;
  }

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
    <>
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
              Ritrova i reset che hai scelto, riprovali in una nuova chat e
              osserva cosa cambia nel tempo.
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
                onCreateRoutineChat={createRoutineChat}
                onCreateAttempt={handleCreateAttempt}
                onSaveOutcome={handleSaveOutcome}
                onArchive={handleArchive}
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
      <ConfirmDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleCancel();
          else setIsOpen(true);
        }}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
      />
    </>
  );
}
