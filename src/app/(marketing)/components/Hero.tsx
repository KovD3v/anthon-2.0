"use client";

import { m } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { defaultTransition, fadeUp, slowTransition } from "@/lib/motion";
import { AnthonScenarioDemo } from "./AnthonScenarioDemo";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pb-16 pt-12 md:pb-24 md:pt-20 lg:pt-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <m.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...defaultTransition, delay: 0.1 }}
            className="font-display mx-auto max-w-5xl text-center text-[2.75rem] font-extrabold uppercase leading-[0.91] tracking-[-0.025em] sm:text-6xl md:text-7xl lg:text-[5.75rem]"
          >
            Più fiducia nei momenti decisivi.
            <span className="mt-1 block text-foreground">
              <span className="relative isolate inline-block px-[0.06em] dark:px-[0.12em] dark:py-[0.04em] dark:text-[#171714]">
                <m.span
                  aria-hidden="true"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...slowTransition, delay: 0.55 }}
                  className="absolute -inset-x-[0.04em] bottom-[0.04em] -z-10 h-[0.38em] origin-left -rotate-[0.6deg] bg-brand-yellow [clip-path:polygon(0_12%,100%_0,98.5%_100%,1%_88%)] dark:-inset-x-[0.08em] dark:bottom-[-0.04em] dark:top-[-0.04em] dark:h-auto"
                />
                Più focus quando conta.
              </span>
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
            <Button
              size="lg"
              className="min-h-12 gap-2 bg-brand-yellow px-7 text-[#171714] hover:bg-brand-yellow/85"
              asChild
            >
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
            whileHover={{ y: -6, rotateX: 0.35, rotateY: -0.35 }}
            className="relative mx-auto mt-12 w-full [perspective:1200px] lg:mt-16"
          >
            <AnthonScenarioDemo />
          </m.div>
        </div>
      </div>
    </section>
  );
}
