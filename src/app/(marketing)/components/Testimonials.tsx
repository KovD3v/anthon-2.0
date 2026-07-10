"use client";

import { m } from "framer-motion";
import { ClipboardCheck, Repeat2, Route } from "lucide-react";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const method = [
  {
    id: "method-context",
    label: "01 — Contesto",
    title: "Parte dalla situazione reale",
    description:
      "Sport, momento della stagione, livello di pressione e obiettivo della prossima performance.",
    icon: ClipboardCheck,
  },
  {
    id: "method-action",
    label: "02 — Azione",
    title: "Trasforma il dialogo in una routine",
    description:
      "Esercizi brevi, istruzioni chiare e un piano utilizzabile prima, durante e dopo la gara.",
    icon: Route,
  },
  {
    id: "method-adapt",
    label: "03 — Adattamento",
    title: "Impara da ciò che succede in campo",
    description:
      "Il feedback post-performance aggiorna il percorso e rende il lavoro successivo più specifico.",
    icon: Repeat2,
  },
];

export function Testimonials() {
  return (
    <section
      className="border-y border-border bg-[#171714] py-16 text-[#f8f5eb] md:py-24"
      id="metodo"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-12 grid gap-5 md:grid-cols-[1fr_0.8fr] md:items-end">
          <m.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={defaultTransition}
            className="font-display max-w-2xl text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl"
          >
            Un metodo pratico, non frasi motivazionali
          </m.h2>
          <m.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="max-w-xl text-lg leading-relaxed text-white/60 md:justify-self-end"
          >
            Ogni conversazione collega il vissuto dell’atleta a un’azione
            concreta e a un ciclo di miglioramento.
          </m.p>
        </div>

        <m.div
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3"
        >
          {method.map((item) => (
            <m.div
              key={item.id}
              variants={fadeUp}
              transition={defaultTransition}
              className="bg-[#1d1d19] p-6 sm:p-8"
            >
              <div className="mb-10 flex items-center justify-between">
                <item.icon className="h-7 w-7 text-brand-yellow" />
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-white/40">
                  {item.label}
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold uppercase leading-none">
                {item.title}
              </h3>
              <p className="mt-4 leading-relaxed text-white/60">
                {item.description}
              </p>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
