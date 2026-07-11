"use client";

import { m } from "framer-motion";
import { ClipboardCheck, Repeat2, Route } from "lucide-react";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const method = [
  {
    id: "method-context",
    label: "Contesto",
    title: "Parte dalla situazione reale",
    description:
      "Sport, momento della stagione, livello di pressione e obiettivo della prossima performance.",
    icon: ClipboardCheck,
  },
  {
    id: "method-action",
    label: "Azione",
    title: "Trasforma il dialogo in una routine",
    description:
      "Esercizi brevi, istruzioni chiare e un piano utilizzabile prima, durante e dopo la gara.",
    icon: Route,
  },
  {
    id: "method-adapt",
    label: "Adattamento",
    title: "Impara da ciò che succede in campo",
    description:
      "Il feedback post-performance aggiorna il percorso e rende il lavoro successivo più specifico.",
    icon: Repeat2,
  },
];

export function Testimonials() {
  return (
    <section
      className="border-y border-border bg-card py-16 text-foreground md:py-24"
      id="metodo"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-12 max-w-3xl">
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
            className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground"
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
          className="grid grid-cols-1 gap-3 md:grid-cols-[1.15fr_0.85fr]"
        >
          {method.map((item) => (
            <m.div
              key={item.id}
              variants={fadeUp}
              transition={defaultTransition}
              className="rounded-2xl border border-border bg-background p-6 sm:p-8 first:md:row-span-2"
            >
              <div className="mb-10 flex items-center justify-between">
                <item.icon className="h-7 w-7 text-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold uppercase leading-none">
                {item.title}
              </h3>
              <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
