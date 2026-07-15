"use client";

import { m } from "framer-motion";
import { Activity, BarChart3, Brain, Shield, Target, Zap } from "lucide-react";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const features = [
  {
    id: "feature-training",
    title: "Fiducia costruita in allenamento",
    description:
      "Allena una routine da ripetere finché diventa familiare, anche nei minuti che precedono la gara.",
    icon: Brain,
  },
  {
    id: "feature-visualization",
    title: "Meno pensieri prima di iniziare",
    description:
      "Usa esercizi brevi per riportare l’attenzione sul primo gesto che dipende da te.",
    icon: Target,
  },
  {
    id: "feature-flow",
    title: "Un reset durante la gara",
    description:
      "Dopo un errore o una pausa, riparti da una sequenza semplice invece di inseguire il risultato.",
    icon: Zap,
  },
  {
    id: "feature-stress",
    title: "La pressione ha un ritmo",
    description:
      "Riconosci cosa succede nel corpo e scegli una risposta che puoi usare sul campo.",
    icon: Shield,
  },
  {
    id: "feature-tracking",
    title: "Capisci cosa sta funzionando",
    description:
      "Registra come ti sei sentito e quali routine hai usato. Nel tempo emergono i segnali da seguire.",
    icon: Activity,
  },
  {
    id: "feature-insights",
    title: "Il lavoro cambia con te",
    description:
      "Anthon usa il tuo feedback per adattare gli esercizi alla fase della stagione e al prossimo obiettivo.",
    icon: BarChart3,
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="border-y border-border bg-card py-16 md:py-24"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-12 max-w-3xl">
          <m.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={defaultTransition}
            className="font-display text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl"
          >
            La preparazione mentale entra in campo con te
          </m.h2>
          <m.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground"
          >
            Preparati prima della gara, ritrova il ritmo nei momenti difficili e
            guarda cosa cambia nel tempo.
          </m.p>
        </div>

        <m.div
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mx-auto grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2"
        >
          {features.map((feature) => (
            <m.div
              key={feature.id}
              variants={fadeUp}
              transition={defaultTransition}
              whileHover={{ y: -4 }}
            >
              <article className="group flex h-full min-h-72 flex-col justify-between rounded-2xl border border-border bg-background p-6 transition-[background-color,border-color] duration-300 hover:border-brand-yellow/70 hover:bg-brand-yellow/5 sm:p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card transition-[background-color,border-color,transform] duration-300 group-hover:rotate-[-3deg] group-hover:border-brand-yellow group-hover:bg-brand-yellow">
                  <feature.icon className="h-5 w-5 text-foreground transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div className="mt-10 max-w-xl">
                  <h3 className="font-display text-2xl font-semibold uppercase leading-none">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </article>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
