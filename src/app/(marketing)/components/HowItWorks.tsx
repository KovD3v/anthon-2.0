"use client";

import { motion } from "framer-motion";
import { MessageSquare, Sparkles, TrendingUp } from "lucide-react";

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

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl"
          >
            Come funziona Anthon
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Il tuo viaggio verso la forza mentale in tre semplici passi.
          </motion.p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 relative"
        >
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-border -z-10" />

          {steps.map((step) => (
            <motion.div
              key={step.id}
              variants={item}
              className="flex flex-col items-center text-center bg-background p-4"
            >
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 border-4 border-background relative z-10">
                <step.icon className="h-10 w-10 text-primary" />
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {step.number}
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
