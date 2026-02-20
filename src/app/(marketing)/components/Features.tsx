"use client";

import { m } from "framer-motion";
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
    title: "Continuita sotto pressione",
    description:
      "Riduci cali di concentrazione e rientra velocemente nel tuo ritmo durante allenamento e gara.",
    icon: Zap,
  },
  {
    id: "feature-stress",
    title: "Pressione gestita, non subita",
    description:
      "Trasforma ansia e tensione in energia utile nei momenti in cui serve lucidita.",
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
          <m.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl"
          >
            Risultati mentali concreti, in campo e in gara
          </m.h2>
          <m.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Ogni area e pensata per migliorare tre leve chiave: fiducia, focus e
            gestione della pressione.
          </m.p>
        </div>

        <m.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <m.div key={feature.id} variants={item}>
              <Card
                variant="glass"
                className="h-full transition-all hover:bg-background/80"
              >
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
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
