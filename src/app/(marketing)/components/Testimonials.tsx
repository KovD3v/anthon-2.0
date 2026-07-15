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
      "Anthon considera lo sport che pratichi, il momento della stagione e cosa ti aspetta nella prossima gara.",
    icon: ClipboardCheck,
  },
  {
    id: "method-action",
    label: "Azione",
    title: "Dal dialogo nasce una routine",
    description:
      "Ricevi esercizi brevi da usare nel momento in cui servono, dentro o fuori dal campo.",
    icon: Route,
  },
  {
    id: "method-adapt",
    label: "Adattamento",
    title: "Impara da ciò che succede in campo",
    description:
      "Dopo la gara racconti cosa ha funzionato. La conversazione successiva riparte da quel feedback.",
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
            Dalla conversazione al campo
          </m.h2>
          <m.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground"
          >
            Anthon parte da ciò che ti è successo, propone una routine e usa il
            tuo feedback per scegliere il passo successivo.
          </m.p>
        </div>

        <m.div
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mx-auto grid max-w-4xl grid-cols-1 gap-3"
        >
          {method.map((item) => (
            <m.div
              key={item.id}
              variants={fadeUp}
              transition={defaultTransition}
              className="grid rounded-2xl border border-border bg-background p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-8"
            >
              <div className="mb-8 flex items-center gap-3 sm:mb-0 sm:flex-col sm:items-start">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow text-[#171714]">
                  <item.icon className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold uppercase leading-none sm:text-3xl">
                  {item.title}
                </h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
