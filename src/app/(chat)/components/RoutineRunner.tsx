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
  getRemainingMs,
  getRoutinePracticeSteps,
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
  onClose: () => void;
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
  onClose,
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
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const announcedTimerEndIdRef = useRef<string | null>(null);
  const currentStep = practiceSteps[state.stepIndex] ?? null;
  const remainingMs =
    currentStep?.kind === "timer"
      ? getRemainingMs(state, currentStep, now)
      : null;
  const isTimerComplete = currentStep?.kind === "timer" && remainingMs === 0;

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    await wakeLock?.release().catch(() => undefined);
  }, []);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    runnerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.status !== "running" || isTimerComplete) return;

    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [isTimerComplete, state.status]);

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
    if (state.status !== "running" || !isDocumentVisible || isTimerComplete) {
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
  }, [isDocumentVisible, isTimerComplete, releaseWakeLock, state.status]);

  useEffect(() => {
    if (currentStep?.kind !== "timer" || remainingMs !== 0) {
      announcedTimerEndIdRef.current = null;
      return;
    }
    if (announcedTimerEndIdRef.current === currentStep.id) return;

    announcedTimerEndIdRef.current = currentStep.id;
    setAnnouncement("Tempo terminato");
  }, [currentStep, remainingMs]);

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
      onComplete();
      return;
    }
    setAnnouncement(
      `Passo ${nextState.stepIndex + 1} di ${practiceSteps.length}`,
    );
  }

  function pause() {
    updateState((previous) => pauseRunner(previous, Date.now()));
    setAnnouncement("Timer in pausa");
  }

  function start() {
    updateState((previous) => startRunner(previous, Date.now()));
    setAnnouncement("Timer avviato");
  }

  function reset() {
    updateState(resetRunner);
    setAnnouncement("");
  }

  function close() {
    updateState((previous) => pauseRunner(previous, Date.now()));
    void releaseWakeLock();
    onClose();
    returnFocusRef.current?.focus();
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

      {state.status === "completed" ? (
        <div className="mt-5 border-border/70 border-t pt-4">
          <h4 className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
            Ho completato la routine
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {routine.completionCue}
          </p>
        </div>
      ) : currentStep ? (
        <div className="mt-5 border-border/70 border-t pt-4">
          <p className="font-mono text-xs font-semibold text-muted-foreground">
            Passo {state.stepIndex + 1} di {practiceSteps.length}
          </p>

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
              <p className="mt-3">
                La guida a fasi sarà disponibile qui. Segui il ritmo indicato e
                seleziona Fatto quando hai concluso.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 min-h-11 rounded-full px-4"
                onClick={advance}
              >
                Fatto
              </Button>
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
