"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import {
  normalizeRoutineProposal,
  type RoutineCardData,
  type RoutineProposal,
} from "@/lib/coaching/routine";
import { trackRoutineAnalytics } from "@/lib/coaching/routine-analytics-client";
import { RoutineClientError } from "@/lib/coaching/routine-client";
import {
  type CreateRoutineAttempt,
  RoutineCheckInForm,
  type SaveRoutineOutcome,
} from "./RoutineCheckInForm";
import { RoutineHistory } from "./RoutineHistory";
import { RoutineRunner } from "./RoutineRunner";

interface RoutineCardProps {
  proposal: RoutineProposal;
  routine: RoutineCardData | null;
  sourceAssistantMessageId: string;
  isGuest: boolean;
  registrationHref: string;
  onSave: (sourceAssistantMessageId: string) => Promise<RoutineCardData>;
  onCreateAttempt: CreateRoutineAttempt;
  onSaveOutcome: SaveRoutineOutcome;
  onArchive: (routineId: string) => Promise<RoutineCardData>;
  /** Persist an unsaved proposal and return the authoritative routine to run. */
  onTryNow: () => Promise<RoutineCardData>;
  onAdapt: () => void;
  /** True when this card invokes an existing routine from the collection. */
  isReused?: boolean;
  openCheckIn?: boolean;
}

type PendingAction = "save" | "start" | "archive" | null;

export function RoutineCard({
  proposal,
  routine,
  sourceAssistantMessageId,
  isGuest,
  registrationHref,
  onSave,
  onCreateAttempt,
  onSaveOutcome,
  onArchive,
  onTryNow,
  onAdapt,
  isReused = false,
  openCheckIn = false,
}: RoutineCardProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(openCheckIn);
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [isCompletionPending, setIsCompletionPending] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completedRoutine, setCompletedRoutine] =
    useState<RoutineCardData | null>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const proposedRoutineRef = useRef<string | null>(null);
  const { confirm, isOpen, options, handleConfirm, handleCancel, setIsOpen } =
    useConfirm();
  const routineAttemptKey = routine?.latestAttempt
    ? `${routine.latestAttempt.id}:${routine.latestAttempt.outcome ?? "pending"}`
    : null;
  const displayedRoutine = completedRoutine ?? routine;
  const snapshot = displayedRoutine?.proposal ?? proposal;
  const normalizedSnapshot = normalizeRoutineProposal(snapshot);
  const isArchived = displayedRoutine?.status === "ARCHIVED";
  const isActive = displayedRoutine?.status === "ACTIVE";
  const hasPendingAttempt =
    isActive && displayedRoutine.latestAttempt?.outcome === null;
  const hasRecordedOutcome =
    isActive &&
    displayedRoutine.latestAttempt?.outcome !== null &&
    displayedRoutine.latestAttempt;
  const lifecycleLabel = isArchived
    ? "Routine archiviata"
    : hasRecordedOutcome
      ? "Esito registrato"
      : hasPendingAttempt
        ? "Tentativo segnato"
        : isActive
          ? "Routine attiva"
          : "Routine proposta";

  useEffect(() => {
    if (openCheckIn && hasPendingAttempt) {
      setIsCheckInOpen(true);
    } else if (!hasPendingAttempt) {
      setIsCheckInOpen(false);
    }
  }, [hasPendingAttempt, openCheckIn]);

  useEffect(() => {
    setCompletedRoutine((current) => {
      if (!current?.latestAttempt) return current;
      const currentAttemptKey = `${current.latestAttempt.id}:${current.latestAttempt.outcome ?? "pending"}`;
      return currentAttemptKey === routineAttemptKey ? null : current;
    });
  }, [routineAttemptKey]);

  useEffect(() => {
    if (isReused) return;
    if (proposedRoutineRef.current === sourceAssistantMessageId) return;
    const storageKey = `routine-proposed:${sourceAssistantMessageId}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    proposedRoutineRef.current = sourceAssistantMessageId;
    window.sessionStorage.setItem(storageKey, "1");
    trackRoutineAnalytics({
      event: "routine_proposed",
      routineId: sourceAssistantMessageId,
      formatVersion: normalizedSnapshot.formatVersion,
      widgetKind: "routine_card",
      technicalState: "success",
    });
  }, [isReused, normalizedSnapshot.formatVersion, sourceAssistantMessageId]);

  async function runAction(
    action: Exclude<PendingAction, null>,
    operation: () => Promise<RoutineCardData>,
    errorMessage: string,
    successMessage?: string,
  ) {
    if (pendingAction) return;

    setPendingAction(action);
    setError(null);
    setStatus(null);
    try {
      const routineResult = await operation();
      if (successMessage) setStatus(successMessage);
      return routineResult;
    } catch (cause) {
      setError(
        cause instanceof RoutineClientError ? cause.message : errorMessage,
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function startProposedRoutine() {
    if (isGuest || pendingAction) return;

    const savedRoutine = await runAction(
      "start",
      onTryNow,
      "Non siamo riusciti ad avviare la routine. Riprova.",
    );
    if (!savedRoutine) return;

    setCompletedRoutine(savedRoutine);
    setIsRunnerOpen(true);
    const startedSnapshot = normalizeRoutineProposal(savedRoutine.proposal);
    trackRoutineAnalytics({
      event: "routine_started",
      routineId: savedRoutine.id,
      formatVersion: startedSnapshot.formatVersion,
      widgetKind: "routine_card",
      technicalState: "success",
    });
  }

  async function recordCompletion() {
    if (!displayedRoutine || isCompletionPending) return;

    setIsCompletionPending(true);
    setCompletionError(null);
    try {
      const updatedRoutine = await onCreateAttempt(displayedRoutine.id);
      setCompletedRoutine(updatedRoutine);
      setIsCheckInOpen(true);
      trackRoutineAnalytics({
        event: "routine_completed",
        routineId: displayedRoutine.id,
        formatVersion: normalizedSnapshot.formatVersion,
        widgetKind: "routine_card",
        technicalState: "success",
      });
    } catch (cause) {
      setCompletionError(
        cause instanceof RoutineClientError
          ? cause.message
          : "Non siamo riusciti a registrare il completamento. Riprova.",
      );
    } finally {
      setIsCompletionPending(false);
    }
  }

  function startRoutine() {
    if (!displayedRoutine || !isActive || hasPendingAttempt) return;

    setIsRunnerOpen(true);
    trackRoutineAnalytics({
      event: "routine_started",
      routineId: displayedRoutine.id,
      formatVersion: normalizedSnapshot.formatVersion,
      widgetKind: "routine_card",
      technicalState: "success",
    });

    const previousAttempt = displayedRoutine.latestAttempt;
    if (!previousAttempt?.outcome) return;
    const elapsedMs =
      Date.now() - new Date(previousAttempt.attemptedAt).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    const temporalWindowDays =
      elapsedMs <= 7 * 86_400_000
        ? 7
        : elapsedMs <= 14 * 86_400_000
          ? 14
          : null;
    if (!temporalWindowDays) return;
    trackRoutineAnalytics({
      event: "routine_restarted_within_14d",
      routineId: displayedRoutine.id,
      formatVersion: normalizedSnapshot.formatVersion,
      widgetKind: "routine_card",
      temporalWindowDays,
      technicalState: "success",
    });
  }

  function closeRunner() {
    setIsRunnerOpen(false);
    window.requestAnimationFrame(() => startButtonRef.current?.focus());
  }

  async function handleRunnerCloseRequest(hasProgress: boolean) {
    if (!hasProgress) {
      closeRunner();
      return;
    }

    const shouldClose = await confirm({
      title: "Interrompere la routine?",
      description: "Il progresso di questa sessione non verrà salvato.",
      confirmText: "Interrompi",
      cancelText: "Continua",
    });
    if (shouldClose) closeRunner();
  }

  return (
    <section
      className="mt-3 w-full rounded-2xl border border-border/80 bg-background/95 p-4 text-foreground shadow-xs sm:p-5"
      aria-labelledby={
        isRunnerOpen ? undefined : `routine-title-${sourceAssistantMessageId}`
      }
      aria-label={isRunnerOpen ? snapshot.title : undefined}
    >
      {!isRunnerOpen && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {lifecycleLabel}
            </p>
            {snapshot.durationLabel && (
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                {snapshot.durationLabel}
              </span>
            )}
          </div>

          <h3
            id={`routine-title-${sourceAssistantMessageId}`}
            className="mt-3 font-display text-xl font-bold uppercase leading-none tracking-tight text-foreground"
          >
            {snapshot.title}
          </h3>

          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quando
              </p>
              <p className="mt-1 leading-relaxed text-foreground/90">
                {snapshot.trigger}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sequenza
              </p>
              <ol className="mt-1.5 space-y-1.5">
                {normalizedSnapshot.practiceSteps.map((step, index) => (
                  <li key={step.id} className="flex gap-2 leading-relaxed">
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {step.kind === "instruction"
                        ? step.text
                        : `${step.label}: ${step.instruction}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-4 border-border/70 border-t pt-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Segnale di riuscita
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">
              {snapshot.completionCue}
            </p>
          </div>

          {!isArchived && !isRunnerOpen && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!isActive &&
                (isGuest ? (
                  <Button
                    asChild
                    size="sm"
                    className="min-h-11 rounded-full px-4"
                  >
                    <Link href={registrationHref}>Salva routine</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 rounded-full px-4"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void (async () => {
                        const savedRoutine = await runAction(
                          "save",
                          () => onSave(sourceAssistantMessageId),
                          "Non siamo riusciti a salvare la routine. Riprova.",
                        );
                        if (!savedRoutine) return;
                        trackRoutineAnalytics({
                          event: "routine_saved",
                          routineId: savedRoutine.id,
                          formatVersion: normalizedSnapshot.formatVersion,
                          widgetKind: "routine_card",
                          technicalState: "success",
                        });
                      })()
                    }
                  >
                    {pendingAction === "save" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Salva routine
                  </Button>
                ))}

              {isActive &&
                displayedRoutine &&
                (!displayedRoutine.latestAttempt || hasRecordedOutcome) && (
                  <Button
                    ref={startButtonRef}
                    type="button"
                    size="sm"
                    className="min-h-11 rounded-full px-4"
                    disabled={pendingAction !== null}
                    onClick={startRoutine}
                  >
                    {hasRecordedOutcome ? "Ripeti routine" : "Avvia routine"}
                  </Button>
                )}

              {!isActive && isGuest ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="min-h-11 rounded-full px-4"
                >
                  <Link href={registrationHref}>Registrati per provarla</Link>
                </Button>
              ) : (
                (!isActive || hasPendingAttempt) && (
                  <Button
                    type="button"
                    size="sm"
                    variant={hasPendingAttempt ? "default" : "outline"}
                    className="min-h-11 rounded-full px-4"
                    disabled={pendingAction !== null}
                    onClick={
                      isActive
                        ? () => setIsCheckInOpen(true)
                        : () => void startProposedRoutine()
                    }
                  >
                    {isActive ? "Com'è andata?" : "La provo ora"}
                  </Button>
                )
              )}

              {isActive && displayedRoutine?.latestAttempt && (
                <Button
                  type="button"
                  size="sm"
                  variant={hasRecordedOutcome ? "default" : "outline"}
                  className="min-h-11 rounded-full px-4"
                  disabled={pendingAction !== null}
                  onClick={onAdapt}
                >
                  Adatta la routine
                </Button>
              )}

              {isActive && displayedRoutine && !hasPendingAttempt && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11 rounded-full px-4 text-muted-foreground hover:text-destructive"
                  disabled={pendingAction !== null}
                  onClick={() =>
                    runAction(
                      "archive",
                      () => onArchive(displayedRoutine.id),
                      "Non siamo riusciti ad archiviare la routine. Riprova.",
                    )
                  }
                >
                  {pendingAction === "archive" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Archivia routine
                </Button>
              )}
            </div>
          )}

          {(pendingAction === "save" || pendingAction === "start") && (
            <output
              className="mt-3 block text-xs text-muted-foreground"
              aria-live="polite"
            >
              {pendingAction === "start"
                ? "Preparazione routine…"
                : "Salvataggio routine…"}
            </output>
          )}
          {status && !pendingAction && (
            <output
              className="mt-3 block text-xs font-medium text-foreground"
              aria-live="polite"
            >
              {status}
            </output>
          )}
          {error && (
            <p
              className="mt-3 text-xs font-medium text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          {displayedRoutine && <RoutineHistory routine={displayedRoutine} />}
        </>
      )}

      {isRunnerOpen && isActive && displayedRoutine && (
        <>
          <RoutineRunner
            routine={normalizedSnapshot}
            completionForm={normalizedSnapshot.completionForm}
            onComplete={() => void recordCompletion()}
            onCloseRequest={handleRunnerCloseRequest}
          />
          {isCompletionPending && (
            <output
              className="mt-3 block text-xs text-muted-foreground"
              aria-live="polite"
            >
              Registro il completamento…
            </output>
          )}
          {completionError && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-destructive" role="alert">
                {completionError}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 rounded-full px-4"
                disabled={isCompletionPending}
                onClick={() => void recordCompletion()}
              >
                {isCompletionPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Riprova
              </Button>
            </div>
          )}
        </>
      )}

      {hasPendingAttempt && displayedRoutine && isCheckInOpen && (
        <RoutineCheckInForm
          routine={displayedRoutine}
          onCreateAttempt={onCreateAttempt}
          onSaveOutcome={onSaveOutcome}
          onSuccess={() => setIsCheckInOpen(false)}
        />
      )}
      <ConfirmDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) setIsOpen(true);
          else handleCancel();
        }}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
        dismissOnOutside
      />
    </section>
  );
}
