"use client";

import { ArrowLeft, ArrowRight, CirclePlay } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const scenarios = [
  {
    id: "errore-decisivo",
    label: "Errore decisivo",
    moment: "Tu, dopo la partita",
    question:
      "Ho sbagliato il rigore. Sono passati tre giorni e continuo a rivederlo.",
    answer:
      "Non devi cancellare l'errore. Devi chiuderlo: separiamo quello che è successo da ciò che puoi allenare al prossimo tiro.",
    routine: "Reset 3R",
    steps: "Rivedi → Riscrivi → Richiudi",
    duration: "6 min",
  },
  {
    id: "ansia-pre-gara",
    label: "Ansia pre-gara",
    moment: "Tu, la sera prima",
    question: "Domani c'è il derby e stanotte non riesco a spegnere la testa.",
    answer:
      "La mente sta provando ad anticipare ogni rischio. Riduciamo la partita a una sola cosa controllabile: il tuo primo pallone.",
    routine: "Protocollo 4-2-6",
    steps: "Respira → Visualizza → Ripeti",
    duration: "4 min",
  },
  {
    id: "rientro",
    label: "Rientro",
    moment: "Tu, prima del rientro",
    question:
      "Il ginocchio sta bene, ma al primo contrasto il corpo si blocca.",
    answer:
      "La fiducia fisica e quella mentale non tornano sempre insieme. La ricostruiamo un gradino alla volta, senza forzare.",
    routine: "Scala di rientro",
    steps: "Immagina → Prova → Aumenta",
    duration: "Giorno 1/5",
  },
  {
    id: "panchina",
    label: "Panchina",
    moment: "Tu, dopo la convocazione",
    question:
      "Terza panchina di fila. Inizio a pensare che allenarmi non serva.",
    answer:
      "La scelta del mister non dipende da te. La tua settimana sì: scegliamo due segnali concreti che rendano visibile il tuo lavoro.",
    routine: "2 obiettivi controllabili",
    steps: "Scegli → Misura → Mostra",
    duration: "7 giorni",
  },
] as const;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export function AnthonScenarioDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [phase, setPhase] = useState<"question" | "answer" | "complete">(
    "question",
  );
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const runIdRef = useRef(0);
  const pausedRef = useRef(false);

  const activeScenario = scenarios[activeIndex];

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const waitWhilePaused = useCallback(async (runId: number) => {
    while (pausedRef.current && runIdRef.current === runId) {
      await sleep(100);
    }
  }, []);

  const selectScenario = (index: number) => {
    if (activeIndex === index) {
      setReplayKey((key) => key + 1);
      return;
    }
    setActiveIndex(index);
  };

  useEffect(() => {
    // Re-selecting the active chip intentionally restarts this playback.
    void replayKey;
    const runId = ++runIdRef.current;

    if (reducedMotion) {
      setQuestionText(activeScenario.question);
      setAnswerText(activeScenario.answer);
      setPhase("complete");
      return;
    }

    setQuestionText("");
    setAnswerText("");
    setPhase("question");

    const typeText = async (
      text: string,
      setter: (value: string) => void,
      speed: number,
    ) => {
      for (let index = 1; index <= text.length; index += 1) {
        if (runIdRef.current !== runId) return false;
        setter(text.slice(0, index));
        await sleep(speed);
      }
      return true;
    };

    const playScenario = async () => {
      if (!(await typeText(activeScenario.question, setQuestionText, 24))) {
        return;
      }
      await sleep(300);
      if (runIdRef.current !== runId) return;
      setPhase("answer");
      if (!(await typeText(activeScenario.answer, setAnswerText, 12))) return;
      setPhase("complete");

      let holdRemaining = 4800;
      while (holdRemaining > 0) {
        if (runIdRef.current !== runId) return;
        await waitWhilePaused(runId);
        await sleep(100);
        if (!pausedRef.current) holdRemaining -= 100;
      }

      if (runIdRef.current === runId) {
        setActiveIndex((index) => (index + 1) % scenarios.length);
      }
    };

    playScenario();
    return () => {
      runIdRef.current += 1;
    };
  }, [activeScenario, reducedMotion, replayKey, waitWhilePaused]);

  const setInteractionPaused = (isPaused: boolean) => {
    if (!reducedMotion) setPaused(isPaused);
  };

  return (
    <section
      aria-label="Scopri come può aiutarti Anthon"
      className="relative mx-auto mt-14 w-full max-w-6xl overflow-hidden rounded-3xl border border-border bg-card text-left shadow-xl shadow-foreground/5"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setInteractionPaused(false);
        }
      }}
    >
      <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
        <div className="relative flex flex-col justify-center p-6 sm:p-9 lg:p-12">
          <h2 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Porta in chat quello che ti succede in gara.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Scegli una situazione. Vedrai come Anthon passa dal racconto a una
            routine da provare.
          </p>

          <fieldset className="mt-7 flex flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">Scegli una situazione</legend>
            {scenarios.map((scenario, index) => (
              <Button
                key={scenario.id}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={index === activeIndex}
                onClick={() => selectScenario(index)}
                className={`rounded-full ${
                  index === activeIndex
                    ? "border-brand-yellow bg-brand-yellow text-[#171714] hover:bg-brand-yellow/85 hover:text-[#171714] dark:border-brand-yellow dark:bg-brand-yellow dark:text-[#171714] dark:hover:bg-brand-yellow/85 dark:hover:text-[#171714]"
                    : "bg-background/60 text-foreground hover:border-brand-yellow/70 hover:bg-brand-yellow/10 dark:bg-background/60 dark:text-foreground dark:hover:border-brand-yellow/70 dark:hover:bg-brand-yellow/10"
                }`}
              >
                {scenario.label}
              </Button>
            ))}
          </fieldset>
        </div>

        <div className="relative bg-secondary p-6 text-secondary-foreground sm:p-9 lg:border-l lg:border-border lg:p-12">
          <div className="flex min-h-[28rem] flex-col justify-center">
            <div className="min-h-24 sm:min-h-28">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-secondary-foreground/70">
                {activeScenario.moment}
              </p>
              <p className="text-xl font-medium leading-relaxed text-secondary-foreground sm:text-2xl">
                “{questionText}
                {phase === "question" && !reducedMotion && (
                  <span
                    className="ml-1 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
                    aria-hidden="true"
                  />
                )}
                {phase !== "question" && "”"}
              </p>
            </div>

            <div className="mt-7 min-h-28 sm:min-h-32">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-secondary-foreground/80">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-brand-yellow"
                />
                Anthon
              </p>
              <p className="text-base leading-relaxed text-secondary-foreground sm:text-lg">
                {answerText}
                {phase === "answer" && !reducedMotion && (
                  <span
                    className="ml-1 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
                    aria-hidden="true"
                  />
                )}
              </p>
            </div>

            <div
              className={`mt-7 grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl bg-card p-4 text-card-foreground shadow-sm transition-all duration-300 sm:grid-cols-[auto_1fr_auto] sm:p-5 ${
                phase === "complete"
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0"
              }`}
              aria-hidden={phase !== "complete"}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-brand-yellow text-[#171714]">
                <CirclePlay aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-semibold uppercase tracking-[0.12em]">
                  {activeScenario.routine}
                </strong>
                <span className="mt-1 block text-sm text-card-foreground/75">
                  {activeScenario.steps}
                </span>
              </span>
              <span className="col-start-2 text-xs font-medium uppercase tracking-[0.16em] text-card-foreground/65 sm:col-start-auto">
                {activeScenario.duration}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  selectScenario(
                    (activeIndex - 1 + scenarios.length) % scenarios.length,
                  )
                }
              >
                <ArrowLeft aria-hidden="true" />
                Prima
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  selectScenario((activeIndex + 1) % scenarios.length)
                }
              >
                Prossima
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-secondary-foreground/15">
              {phase === "complete" && !reducedMotion && (
                <span
                  key={`${activeScenario.id}-${replayKey}`}
                  className={`block h-full origin-left bg-brand-yellow [animation:scenario-progress_4.8s_linear_forwards] ${
                    paused ? "[animation-play-state:paused]" : ""
                  }`}
                />
              )}
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            Scenario {activeIndex + 1}: {activeScenario.question}. Risposta di
            Anthon: {activeScenario.answer}. Esercizio: {activeScenario.routine}
            ,{activeScenario.duration}.
          </p>
        </div>
      </div>
    </section>
  );
}
