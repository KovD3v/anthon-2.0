"use client";

import { m } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Command,
  Keyboard,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { defaultTransition, fadeUp } from "@/lib/motion";

export default function HelpPage() {
  const features = [
    {
      icon: Brain,
      title: "Mental coach AI",
      description:
        "Anthon parte dal tuo contesto sportivo per aiutarti a gestire pressione, fiducia e concentrazione.",
    },
    {
      icon: Zap,
      title: "Feedback immediato",
      description:
        "Ricevi indicazioni operative e valuta le risposte per rendere il supporto progressivamente più utile.",
    },
    {
      icon: Search,
      title: "Ricerca intelligente",
      description:
        "Ritrova conversazioni e messaggi passati con una ricerca pensata per il significato, non solo per le parole.",
    },
    {
      icon: Sparkles,
      title: "Esportazione Markdown",
      description:
        "Esporta le conversazioni importanti in Markdown per conservarle o condividerle.",
    },
  ];

  const shortcuts = [
    {
      keys: ["Cmd", "N"],
      description: "Avvia subito una nuova conversazione",
    },
    {
      keys: ["Cmd", "K"],
      description: "Apri la ricerca nei messaggi",
    },
    {
      keys: ["Cmd", "/"],
      description: "Apri o chiudi la barra laterale",
    },
    {
      keys: ["Esc"],
      description: "Chiudi ricerca o finestre aperte",
    },
  ];

  return (
    <PageWrapper>
      <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[20%] h-[600px] w-[600px] rounded-full bg-brand-yellow/10 blur-[100px]" />
        </div>

        <div className="container relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-16 text-center">
            <m.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              transition={defaultTransition}
            >
              <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Centro assistenza
              </p>
              <h1 className="font-display mb-6 mt-4 text-5xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-6xl">
                Come usare{" "}
                <span className="underline decoration-brand-yellow decoration-[0.2em] underline-offset-[0.1em]">
                  Anthon
                </span>
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Scopri le funzioni principali e velocizza il tuo lavoro con le
                scorciatoie da tastiera.
              </p>
            </m.div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
            {features.map((feature, index) => (
              <m.div
                key={feature.title}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ ...defaultTransition, delay: index * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-yellow text-[#171714]">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </m.div>
            ))}
          </div>

          {/* Shortcuts Section */}
          <m.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ ...defaultTransition, delay: 0.3 }}
            className="mb-20 rounded-3xl border border-border bg-card p-8 sm:p-12"
          >
            <div className="flex items-center gap-2 mb-8">
              <Keyboard className="h-8 w-8 text-foreground" />
              <h2 className="text-lg font-semibold text-foreground">
                Scorciatoie da tastiera
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between rounded-xl border border-border bg-background p-4"
                >
                  <span className="text-foreground/80 font-medium">
                    {shortcut.description}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-muted px-2 text-sm font-semibold text-muted-foreground shadow-sm"
                      >
                        {key === "Cmd" ? (
                          <Command className="h-4 w-4" />
                        ) : key === "Ctrl" ? (
                          <span className="text-xs">Ctrl</span>
                        ) : (
                          key
                        )}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </m.div>

          {/* CTA */}
          <div className="text-center">
            <Link href="/chat">
              <Button
                size="lg"
                className="h-12 px-8 text-base gap-2 rounded-full"
              >
                Inizia a chattare
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
