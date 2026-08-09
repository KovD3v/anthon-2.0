"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  NormalizedRoutineProposal,
  RoutineCompletionForm,
} from "@/lib/coaching/routine";
import {
  advanceRunner,
  createInitialRunnerState,
  getBreathingPhase,
  getElapsedMs,
  getRemainingMs,
  getRoutinePracticeSteps,
  getRoutineProgress,
  pauseRunner,
  resetRunner,
  startRunner,
} from "@/lib/coaching/routine-runner";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface RoutineRunnerProps {
  routine: NormalizedRoutineProposal;
  completionForm: RoutineCompletionForm | null;
  onComplete: () => void;
  onCloseRequest: (hasProgress: boolean) => void;
}

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function formatRemainingMs(remainingMs: number): string {
  const remainingSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RoutineRunner({
  routine,
  onComplete,
  onCloseRequest,
}: RoutineRunnerProps) {
  const practiceSteps = getRoutinePracticeSteps(routine);
  const [state, setState] = useState(createInitialRunnerState);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const runnerRef = useRef<HTMLElement>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const announcedTimerEndIdRef = useRef<string | null>(null);
  const announcedBreathingPhaseRef = useRef<string | null>(null);
  const completionSubmittedRef = useRef(false);
  const currentStep = practiceSteps[state.stepIndex] ?? null;
  const progress = getRoutineProgress(state, practiceSteps, now);
  const remainingMs =
    currentStep?.kind === "timer"
      ? getRemainingMs(state, currentStep, now)
      : null;
  const isTimerComplete = currentStep?.kind === "timer" && remainingMs === 0;
  const breathingPhase =
    currentStep?.kind === "breathing"
      ? getBreathingPhase(currentStep, getElapsedMs(state, now))
      : null;
  const isBreathingComplete =
    currentStep?.kind === "breathing" && breathingPhase === null;
  const isTimedStepComplete = isTimerComplete || isBreathingComplete;

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    await wakeLock?.release().catch(() => undefined);
  }, []);

  useEffect(() => {
    runnerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.status !== "running" || isTimedStepComplete) return;

    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [isTimedStepComplete, state.status]);

  useEffect(() => {
    function handleVisibilityChange() {
      const visible = document.visibilityState !== "hidden";
      setIsDocumentVisible(visible);
      setNow(Date.now());
      if (!visible) void releaseWakeLock();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [releaseWakeLock]);

  useEffect(() => {
    if (
      state.status !== "running" ||
      !isDocumentVisible ||
      isTimedStepComplete
    ) {
      void releaseWakeLock();
      return;
    }

    const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
    if (!wakeLock) return;

    let cancelled = false;
    void wakeLock
      .request("screen")
      .then((sentinel) => {
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void releaseWakeLock();
    };
  }, [isDocumentVisible, isTimedStepComplete, releaseWakeLock, state.status]);

  useEffect(() => {
    if (!isTimedStepComplete || !currentStep) {
      announcedTimerEndIdRef.current = null;
      return;
    }
    if (announcedTimerEndIdRef.current === currentStep.id) return;

    announcedTimerEndIdRef.current = currentStep.id;
    setAnnouncement(
      currentStep.kind === "breathing"
        ? "Respirazione completata"
        : "Tempo terminato",
    );
  }, [currentStep, isTimedStepComplete]);

  useEffect(() => {
    if (state.status !== "running" || !currentStep || !breathingPhase) return;
    const key = `${currentStep.id}:${breathingPhase.cycle}:${breathingPhase.phase}`;
    if (announcedBreathingPhaseRef.current === key) return;
    announcedBreathingPhaseRef.current = key;
    setAnnouncement(`${breathingPhase.label}, ciclo ${breathingPhase.cycle}`);
  }, [breathingPhase, currentStep, state.status]);

  function updateState(update: (previous: typeof state) => typeof state) {
    setState((previous) => update(previous));
    setNow(Date.now());
  }

  function advance() {
    const timestamp = Date.now();
    const nextState = advanceRunner(state, practiceSteps, timestamp);
    if (nextState === state) return;

    setState(nextState);
    setNow(timestamp);
    if (nextState.status === "completed") {
      setAnnouncement("Routine completata");
      return;
    }
    setAnnouncement(
      `Passo ${nextState.stepIndex + 1} di ${practiceSteps.length}`,
    );
  }

  function pause() {
    updateState((previous) => pauseRunner(previous, Date.now()));
    setAnnouncement(
      currentStep?.kind === "breathing"
        ? "Respirazione in pausa"
        : "Timer in pausa",
    );
  }

  function start() {
    updateState((previous) => startRunner(previous, Date.now()));
    setAnnouncement(
      currentStep?.kind === "breathing"
        ? "Respirazione avviata"
        : "Timer avviato",
    );
  }

  function reset() {
    updateState(resetRunner);
    setAnnouncement("");
  }

  function confirmCompletion() {
    if (completionSubmittedRef.current) return;

    completionSubmittedRef.current = true;
    onComplete();
  }

  function close() {
    onCloseRequest(
      state.stepIndex > 0 || state.elapsedMs > 0 || state.status !== "idle",
    );
  }

  return (
    <section
      ref={runnerRef}
      tabIndex={-1}
      aria-labelledby="routine-runner-title"
      className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-xs transition-[opacity,transform] duration-200 motion-reduce:transition-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Routine guidata
          </p>
          <h3
            id="routine-runner-title"
            className="mt-1 font-display text-xl font-bold uppercase tracking-tight text-foreground"
          >
            {routine.title}
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 rounded-full px-4"
          onClick={close}
        >
          Chiudi
        </Button>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Avanzamento routine"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.routinePercent}
      >
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${progress.routinePercent}%` }}
        />
      </div>

      {state.status === "completed" ? (
        <div className="mt-5 border-border/70 border-t pt-4">
          <h4 className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
            Ho completato la routine
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {routine.completionCue}
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4 min-h-11 rounded-full px-4"
            disabled={completionSubmittedRef.current}
            onClick={confirmCompletion}
          >
            Ho completato la routine
          </Button>
        </div>
      ) : currentStep ? (
        <div className="mt-5 border-border/70 border-t pt-4">
          <p className="font-mono text-xs font-semibold text-muted-foreground">
            Passo {progress.stepNumber} di {progress.totalSteps}
          </p>

          {progress.stepPercent !== null && (
            <div
              aria-hidden="true"
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${progress.stepPercent}%` }}
              />
            </div>
          )}

          {currentStep.kind === "instruction" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                {currentStep.text}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 min-h-11 rounded-full px-4"
                onClick={advance}
              >
                Fatto
              </Button>
            </>
          )}

          {currentStep.kind === "timer" && (
            <>
              <h4 className="mt-3 font-display text-lg font-bold uppercase tracking-tight text-foreground">
                {currentStep.label}
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {currentStep.instruction}
              </p>
              <p className="mt-5 font-mono text-4xl font-semibold tabular-nums text-foreground">
                {formatRemainingMs(remainingMs ?? 0)}
              </p>
              {remainingMs === 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Tempo terminato
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 rounded-full px-4"
                    onClick={advance}
                  >
                    Continua
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {state.status === "running" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 rounded-full px-4"
                      onClick={pause}
                    >
                      Pausa
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 rounded-full px-4"
                      onClick={start}
                    >
                      Avvia
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 rounded-full px-4"
                    onClick={reset}
                  >
                    Ripristina
                  </Button>
                </div>
              )}
            </>
          )}

          {currentStep.kind === "breathing" && (
            <div className="mt-3 text-sm leading-relaxed text-foreground/90">
              <p className="font-medium text-foreground">
                Respirazione guidata
              </p>
              <p className="mt-1 font-medium text-foreground">
                {currentStep.label}
              </p>
              <p className="mt-1">{currentStep.instruction}</p>
              {breathingPhase ? (
                <>
                  <div className="mt-5 flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className={`size-12 shrink-0 rounded-full border-4 border-primary/50 bg-primary/15 animate-pulse motion-reduce:hidden ${
                        breathingPhase.phase === "inhale"
                          ? "scale-110"
                          : breathingPhase.phase === "exhale"
                            ? "scale-75"
                            : "scale-90"
                      }`}
                      data-testid="breathing-indicator"
                    />
                    <div>
                      <p
                        className="font-display text-2xl font-bold uppercase tracking-tight text-foreground"
                        data-testid="breathing-phase"
                      >
                        {breathingPhase.label} ·{" "}
                        {formatRemainingMs(breathingPhase.remainingMs)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Ciclo {breathingPhase.cycle} di {currentStep.cycles}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {state.status === "running" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 rounded-full px-4"
                        onClick={pause}
                      >
                        Pausa
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 rounded-full px-4"
                        onClick={start}
                      >
                        Avvia
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 rounded-full px-4"
                      onClick={reset}
                    >
                      Ripristina
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Respirazione completata
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 rounded-full px-4"
                    onClick={advance}
                  >
                    Continua
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>
    </section>
  );
}
