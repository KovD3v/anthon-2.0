"use client";

import {
  Activity,
  ArrowUpRight,
  Check,
  Pause,
  Play,
  Target,
  TimerReset,
} from "lucide-react";
import { useEffect, useState } from "react";

const EXERCISE_DURATION = 120;
const breathingPhases = [
  { label: "Inspira", instruction: "Inspira per 4", duration: 4 },
  { label: "Ferma", instruction: "Ferma per 2", duration: 2 },
  { label: "Espira", instruction: "Espira per 6", duration: 6 },
] as const;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
}

function getPhaseIndex(elapsed: number) {
  const cycleDuration = breathingPhases.reduce(
    (total, phase) => total + phase.duration,
    0,
  );
  const cycleSecond = elapsed % cycleDuration;
  let threshold = 0;

  return breathingPhases.findIndex((phase) => {
    threshold += phase.duration;
    return cycleSecond < threshold;
  });
}

export function HeroProductPreview() {
  const [exercise, setExercise] = useState({
    remaining: EXERCISE_DURATION,
    isRunning: false,
  });
  const { remaining, isRunning } = exercise;
  const elapsed = EXERCISE_DURATION - remaining;
  const phaseIndex = remaining === 0 ? -1 : getPhaseIndex(elapsed);
  const progress = (elapsed / EXERCISE_DURATION) * 100;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setExercise((current) => {
        const remaining = Math.max(0, current.remaining - 1);
        return { remaining, isRunning: remaining > 0 };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  const toggleExercise = () => {
    if (remaining === 0) {
      setExercise({ remaining: EXERCISE_DURATION, isRunning: true });
      return;
    }

    setExercise((current) => ({
      ...current,
      isRunning: !current.isRunning,
    }));
  };

  const status =
    remaining === 0
      ? "Esercizio completato"
      : isRunning
        ? breathingPhases[phaseIndex].label
        : elapsed > 0
          ? "In pausa"
          : "Pronto";

  const actionLabel =
    remaining === 0
      ? "Ripeti esercizio"
      : isRunning
        ? "Metti in pausa"
        : elapsed > 0
          ? "Riprendi esercizio"
          : "Avvia esercizio";

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-foreground/15 bg-[#171714] text-[#f8f5eb] shadow-[0_35px_90px_-42px_rgba(0,0,0,0.8)]">
      <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <section className="border-b border-white/10 p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/45">
                Contesto atleta
              </p>
              <h3 className="font-display mt-2 text-3xl font-bold uppercase leading-none tracking-tight sm:text-4xl">
                Finale regionale
              </h3>
            </div>
            <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-white/60">
              Tennis
            </span>
          </div>

          <blockquote className="border-l-2 border-brand-yellow pl-4 text-base leading-relaxed text-white/75 sm:text-lg">
            “Quando il punteggio si chiude, accelero tutto e perdo il controllo
            del respiro.”
          </blockquote>

          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10">
            <div className="bg-[#1d1d19] p-4">
              <div className="flex items-center gap-2 text-white/45">
                <Activity className="h-4 w-4" />
                <span className="font-mono text-[0.65rem] uppercase tracking-wider">
                  Tensione
                </span>
              </div>
              <p className="font-display mt-2 text-3xl font-bold">
                8<span className="text-base text-white/35">/10</span>
              </p>
            </div>
            <div className="bg-[#1d1d19] p-4">
              <div className="flex items-center gap-2 text-white/45">
                <Target className="h-4 w-4" />
                <span className="font-mono text-[0.65rem] uppercase tracking-wider">
                  Obiettivo
                </span>
              </div>
              <p className="font-display mt-2 text-3xl font-bold">Lucidità</p>
            </div>
          </div>
        </section>

        <section className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/45">
                Risposta di Anthon
              </p>
              <h3 className="mt-2 text-xl font-semibold sm:text-2xl">
                Prima rallentiamo il corpo. Poi scegliamo il prossimo punto.
              </h3>
            </div>
            <ArrowUpRight className="hidden h-6 w-6 text-white/40 sm:block" />
          </div>

          <p className="mt-4 max-w-xl leading-relaxed text-white/60">
            Non devi eliminare la tensione: devi darle un ritmo. Usa questa
            sequenza tra il riscaldamento e l’ingresso in campo.
          </p>

          <div className="mt-6 rounded-2xl bg-brand-yellow p-5 text-[#171714] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10">
                  <TimerReset className="h-5 w-5" />
                </span>
                <div>
                  <p
                    className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.18em] opacity-60"
                    aria-live="polite"
                  >
                    {status}
                  </p>
                  <h4 className="font-display mt-1 text-2xl font-bold uppercase leading-none sm:text-3xl">
                    Reset 4-2-6
                  </h4>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums">
                {formatTime(remaining)}
              </span>
            </div>

            <div
              className="mt-5 h-1 overflow-hidden rounded-full bg-black/15"
              aria-hidden="true"
            >
              <div
                className="h-full bg-[#171714]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              {breathingPhases.map((phase, index) => {
                const isActive = phaseIndex === index;

                return (
                  <li
                    key={phase.label}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      isActive
                        ? "border-[#171714] bg-[#171714] text-[#f8f5eb]"
                        : "border-black/15"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {phase.instruction}
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={toggleExercise}
              aria-pressed={isRunning}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171714] px-4 text-sm font-semibold text-[#f8f5eb] hover:bg-[#24241f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171714]"
            >
              {isRunning ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {actionLabel}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
