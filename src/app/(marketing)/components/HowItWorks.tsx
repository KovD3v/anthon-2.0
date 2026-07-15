"use client";

import { m } from "framer-motion";
import { MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { defaultTransition, fadeUp, staggerContainer } from "@/lib/motion";

const steps = [
  {
    id: "step-chat",
    title: "Parla con Anthon",
    description:
      "Racconta cosa è successo, cosa ti aspetta e dove senti più pressione. Anthon parte da lì.",
    icon: MessageSquare,
  },
  {
    id: "step-plan",
    title: "Ottieni il tuo piano",
    description:
      "Ricevi una routine adatta a quel momento, con esercizi di respirazione, visualizzazioni o indicazioni da portare in campo.",
    icon: Sparkles,
  },
  {
    id: "step-track",
    title: "Monitora e migliora",
    description:
      "Dopo la partita, racconta com’è andata. Anthon tiene conto del tuo feedback nella conversazione successiva.",
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
            Parti da una situazione precisa. Esci dalla chat con qualcosa da
            provare.
          </m.p>
        </div>

        <m.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="relative mx-auto grid max-w-4xl grid-cols-1 gap-4"
        >
          {steps.map((step) => (
            <m.div
              key={step.id}
              variants={fadeUp}
              transition={defaultTransition}
              whileHover={{ y: -4 }}
            >
              <Card className="group grid h-full rounded-2xl bg-card p-6 text-left shadow-none transition-[border-color,box-shadow] duration-300 hover:border-brand-yellow/60 hover:shadow-[0_20px_50px_-36px_rgba(0,0,0,0.7)] sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-8">
                <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-yellow text-[#171714] transition-transform duration-300 group-hover:rotate-3 sm:mb-0">
                  <step.icon className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div>
                  <h3 className="font-display mb-3 text-2xl font-bold uppercase leading-none sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="max-w-2xl leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Card>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
