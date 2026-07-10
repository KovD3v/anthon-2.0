"use client";

import { m } from "framer-motion";
import { MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const steps = [
  {
    id: "step-chat",
    number: "01",
    title: "Parla con Anthon",
    description:
      "Racconta ad Anthon delle tue prossime partite, delle sfide attuali e dei tuoi obiettivi. Lui ascolta e comprende il tuo contesto unico.",
    icon: MessageSquare,
  },
  {
    id: "step-plan",
    number: "02",
    title: "Ottieni il tuo piano",
    description:
      "Ricevi un piano di preparazione mentale personalizzato, inclusi audio di visualizzazione, esercizi di respirazione e affermazioni.",
    icon: Sparkles,
  },
  {
    id: "step-track",
    number: "03",
    title: "Monitora e migliora",
    description:
      "Registra le tue sensazioni dopo le partite e gli allenamenti. Anthon adatta i suoi consigli in base al tuo feedback e ai tuoi progressi.",
    icon: TrendingUp,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-14 text-center">
          <m.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={defaultTransition}
            className="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl"
          >
            Come funziona Anthon
          </m.h2>
          <m.p
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground"
          >
            Il tuo viaggio verso la forza mentale in tre semplici passi.
          </m.p>
        </div>

        <m.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="relative grid grid-cols-1 gap-5 md:grid-cols-3"
        >
          {/* Connecting line for desktop */}
          <div className="editorial-rule absolute left-[16%] right-[16%] top-12 -z-10 hidden h-px text-primary md:block" />

          {steps.map((step) => (
            <m.div
              key={step.id}
              variants={fadeUp}
              transition={defaultTransition}
            >
              <Card className="flex h-full flex-col items-start rounded-2xl bg-card p-6 text-left shadow-none">
                <div className="relative z-10 mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                  <step.icon className="h-8 w-8 text-primary" />
                  <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
                    {step.number}
                  </div>
                </div>
                <h3 className="font-display mb-3 text-2xl font-bold uppercase leading-none">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
