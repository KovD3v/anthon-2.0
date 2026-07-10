"use client";

import { m } from "framer-motion";
import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defaultTransition, fadeUp, slowTransition } from "@/lib/motion";
import { HeroProductPreview } from "./HeroProductPreview";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pb-16 pt-12 md:pb-24 md:pt-20 lg:pt-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <m.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={defaultTransition}
            className="flex justify-center"
          >
            <Badge
              variant="info"
              className="gap-1 border-primary/30 bg-primary/10 text-foreground"
            >
              <Trophy className="h-3 w-3" />
              <span>Mental coaching per sportivi</span>
            </Badge>
          </m.div>

          <m.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="font-display mx-auto mt-7 max-w-5xl text-center text-[2.75rem] font-extrabold uppercase leading-[0.91] tracking-[-0.025em] sm:text-6xl md:text-7xl lg:text-[5.75rem]"
          >
            Più fiducia nei momenti decisivi.
            <span className="mt-1 block text-primary">
              Più focus quando conta.
            </span>
          </m.h1>

          <m.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...defaultTransition, delay: 0.2 }}
            className="mx-auto mt-7 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            Anthon ti aiuta a gestire pressione, distrazioni e cali mentali con
            routine pratiche prima, durante e dopo gara.
          </m.p>

          <m.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...defaultTransition, delay: 0.3 }}
            className="mt-8 flex w-full flex-col justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" className="min-h-12 gap-2 px-7" asChild>
              <Link href="/chat">
                Inizia in chat <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-12 px-7"
              asChild
            >
              <Link href="/pricing">Vedi i piani</Link>
            </Button>
          </m.div>

          <m.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...slowTransition, delay: 0.4 }}
            className="relative mx-auto mt-12 w-full lg:mt-16"
          >
            <div className="mb-3 flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Un caso reale, dall’input all’azione</span>
              <span className="hidden sm:inline">01 / Prodotto</span>
            </div>
            <HeroProductPreview />
          </m.div>
        </div>
      </div>
    </section>
  );
}
