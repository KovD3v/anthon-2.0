"use client";

import { motion } from "framer-motion";
import { Activity, BarChart3, Brain, Shield, Target, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    id: "feature-training",
    title: "Allenamento Mentale Personalizzato",
    description:
      "Esercizi quotidiani su misura per il tuo sport, i tuoi obiettivi e il tuo stato mentale attuale.",
    icon: Brain,
  },
  {
    id: "feature-visualization",
    title: "Visualizzazione Pre-Gara",
    description:
      "Sessioni di visualizzazione guidata per preparare la tua mente alla massima performance.",
    icon: Target,
  },
  {
    id: "feature-flow",
    title: "Focus e Stato di Flow",
    description:
      "Tecniche per entrare e mantenere lo stato di flow durante la competizione.",
    icon: Zap,
  },
  {
    id: "feature-stress",
    title: "Gestione dello Stress",
    description:
      "Impara a gestire la pressione e a trasformare l'ansia in eccitazione.",
    icon: Shield,
  },
  {
    id: "feature-tracking",
    title: "Monitoraggio delle Performance",
    description:
      "Monitora la tua resilienza mentale e i tuoi progressi nel tempo.",
    icon: Activity,
  },
  {
    id: "feature-insights",
    title: "Analisi Basata sui Dati",
    description:
      "Comprendi i pattern delle tue prestazioni e del tuo benessere mentale.",
    icon: BarChart3,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function Features() {
  return (
    <section id="features" className="py-16 md:py-24 bg-muted/50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl"
          >
            Allena il tuo cervello come un muscolo
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Strumenti completi progettati da psicologi dello sport per aiutarti
            a raggiungere la padronanza mentale.
          </motion.p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div key={feature.id} variants={item}>
              <Card className="border-none shadow-md bg-background h-full">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
