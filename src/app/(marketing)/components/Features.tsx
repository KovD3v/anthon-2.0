"use client";

import { m } from "framer-motion";
import { Activity, BarChart3, Brain, Shield, Target, Zap } from "lucide-react";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const features = [
  {
    id: "feature-training",
    title: "Più fiducia in gara",
    description:
      "Costruisci una routine mentale stabile per arrivare alle gare con sicurezza, non con dubbi.",
    icon: Brain,
  },
  {
    id: "feature-visualization",
    title: "Focus immediato prima della performance",
    description:
      "Preparati in pochi minuti con esercizi guidati che ti aiutano a entrare nella zona giusta.",
    icon: Target,
  },
  {
    id: "feature-flow",
    title: "Continuità sotto pressione",
    description:
      "Riduci cali di concentrazione e rientra velocemente nel tuo ritmo durante allenamento e gara.",
    icon: Zap,
  },
  {
    id: "feature-stress",
    title: "Pressione gestita, non subita",
    description:
      "Trasforma ansia e tensione in energia utile nei momenti in cui serve lucidità.",
    icon: Shield,
  },
  {
    id: "feature-tracking",
    title: "Progressi visibili settimana dopo settimana",
    description:
      "Monitora i tuoi risultati mentali per capire cosa funziona davvero nel tuo percorso.",
    icon: Activity,
  },
  {
    id: "feature-insights",
    title: "Decisioni migliori per il tuo percorso",
    description:
      "Leggi i tuoi pattern di performance e adatta il lavoro mentale in base ai tuoi obiettivi sportivi.",
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
            Risultati mentali concreti, in campo e in gara
          </m.h2>
          <m.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground"
          >
            Ogni area è pensata per migliorare tre leve chiave: fiducia, focus e
            gestione della pressione.
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
