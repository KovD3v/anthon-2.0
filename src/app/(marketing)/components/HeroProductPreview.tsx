import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  Play,
  Target,
  TimerReset,
} from "lucide-react";

export function HeroProductPreview() {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-foreground/15 bg-[#171714] text-[#f8f5eb] shadow-[0_35px_90px_-42px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_18px_rgba(244,211,36,0.75)]" />
          <span className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.2em] text-white/70">
            Sessione pre-gara
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.68rem] text-white/45">
          <Clock3 className="h-3.5 w-3.5" />
          <span>18:42</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <section className="border-b border-white/10 p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary">
                Contesto atleta
              </p>
              <h3 className="font-display mt-2 text-3xl font-bold uppercase leading-none tracking-tight sm:text-4xl">
                Finale regionale
              </h3>
            </div>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-primary">
              Tennis
            </span>
          </div>

          <blockquote className="border-l-2 border-primary pl-4 text-base leading-relaxed text-white/75 sm:text-lg">
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
              <p className="font-display mt-2 text-3xl font-bold text-primary">
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
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary">
                Risposta di Anthon
              </p>
              <h3 className="mt-2 text-xl font-semibold sm:text-2xl">
                Prima rallentiamo il corpo. Poi scegliamo il prossimo punto.
              </h3>
            </div>
            <ArrowUpRight className="hidden h-6 w-6 text-primary sm:block" />
          </div>

          <p className="mt-4 max-w-xl leading-relaxed text-white/60">
            Non devi eliminare la tensione: devi darle un ritmo. Usa questa
            sequenza tra il riscaldamento e l’ingresso in campo.
          </p>

          <div className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10">
                  <TimerReset className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.18em] opacity-60">
                    Esercizio generato
                  </p>
                  <h4 className="font-display mt-1 text-2xl font-bold uppercase leading-none sm:text-3xl">
                    Reset 4—2—6
                  </h4>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold">02:00</span>
            </div>

            <ol className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
              {["Inspira per 4", "Ferma per 2", "Espira per 6"].map((step) => (
                <li
                  key={step}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/5 px-3 py-2"
                >
                  <Check className="h-3.5 w-3.5" />
                  {step}
                </li>
              ))}
            </ol>

            <div className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171714] px-4 text-sm font-semibold text-[#f8f5eb]">
              <Play className="h-4 w-4 fill-current" />
              Anteprima esercizio
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
