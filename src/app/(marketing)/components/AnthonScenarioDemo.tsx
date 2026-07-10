"use client";

import { ArrowLeft, ArrowRight, CirclePlay, Pause, Play } from "lucide-react";
import Link from "next/link";
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
    prompt:
      "Ho sbagliato un rigore decisivo e continuo a pensarci. Mi aiuti a superarlo?",
  },
  {
    id: "ansia-pre-gara",
    label: "Ansia pre-gara",
    moment: "Tu, la sera prima",
    question: "Domani c'è il derby e stanotte non riesco a spegnere la testa.",
    answer:
      "La mente sta provando ad anticipare ogni rischio. Riduciamo la partita a una sola cosa controllabile: il tuo primo pallone.",
    routine: "Protocollo 4–2–6",
    steps: "Respira → Visualizza → Ripeti",
    duration: "4 min",
    prompt:
      "Domani gioco il derby e non riesco a staccare la testa. Mi aiuti a prepararmi?",
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
    prompt:
      "Sto rientrando da un infortunio e ho paura del primo contrasto. Come posso lavorarci?",
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
    prompt:
      "Sono in panchina da tre giornate e sto perdendo motivazione. Mi aiuti a ritrovarla?",
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
      className="relative mx-auto mt-14 w-full max-w-6xl overflow-hidden rounded-3xl border border-border/70 bg-card/80 text-left shadow-2xl shadow-brand-yellow/5 backdrop-blur-xl"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setInteractionPaused(false);
        }
      }}
    >
      <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand-yellow/15 blur-3xl" />
      <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
        <div className="relative flex flex-col justify-center p-6 sm:p-9 lg:p-12">
          <div className="mb-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow ring-4 ring-brand-yellow/15" />
            Mental coaching per sportivi
          </div>

          <h2 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            La partita è finita. La testa no.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Scegli il momento che stai vivendo. Anthon ti aiuta a trasformarlo
            in qualcosa che puoi allenare, adesso.
          </p>

          <fieldset className="mt-7 flex flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">Scegli una situazione</legend>
            {scenarios.map((scenario, index) => (
              <Button
                key={scenario.id}
                type="button"
                size="sm"
                variant={index === activeIndex ? "default" : "outline"}
                aria-pressed={index === activeIndex}
                onClick={() => selectScenario(index)}
                className="rounded-full"
              >
                {scenario.label}
              </Button>
            ))}
          </fieldset>

          <Button asChild size="lg" className="mt-8 w-full gap-2 sm:w-fit">
            <Link href={`/chat?q=${encodeURIComponent(activeScenario.prompt)}`}>
              Parlane con Anthon
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="relative border-t border-border/70 bg-muted/25 p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-12">
          <div className="flex min-h-[28rem] flex-col justify-center">
            <div className="min-h-28">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {activeScenario.moment}
              </p>
              <p className="text-xl font-medium leading-relaxed sm:text-2xl">
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

            <div className="mt-8 min-h-32">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-brand-yellow">
                Anthon
              </p>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
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
              className={`mt-7 grid grid-cols-[auto_1fr] items-center gap-4 border-y border-border/70 py-5 transition-all duration-300 sm:grid-cols-[auto_1fr_auto] ${
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
                <span className="mt-1 block text-sm text-muted-foreground">
                  {activeScenario.steps}
                </span>
              </span>
              <span className="col-start-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground sm:col-start-auto">
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
              {!reducedMotion && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={paused}
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused ? (
                    <Play aria-hidden="true" />
                  ) : (
                    <Pause aria-hidden="true" />
                  )}
                  {paused ? "Riprendi" : "Pausa"}
                </Button>
              )}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {String(activeIndex + 1).padStart(2, "0")} /{" "}
                {String(scenarios.length).padStart(2, "0")}
              </span>
            </div>

            <div className="mt-4 h-px overflow-hidden bg-border">
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
