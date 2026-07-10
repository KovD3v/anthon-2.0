"use client";

import { useUser } from "@clerk/nextjs";
import {
  Brain,
  CalendarClock,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { useChatContext } from "./layout-client";

const starterPrompts = [
  {
    id: "gara-domani",
    title: "Ho una gara domani",
    description: "Prepara una routine breve per arrivare lucido alla partenza.",
    prompt:
      "Ho una gara domani. Aiutami a preparare una routine mentale breve per arrivare concentrato e gestire la pressione.",
    icon: CalendarClock,
  },
  {
    id: "errore",
    title: "Mi blocco dopo un errore",
    description: "Costruisci un reset mentale da usare durante la performance.",
    prompt:
      "Dopo un errore perdo concentrazione e fiducia. Voglio costruire un reset mentale semplice da usare durante la gara.",
    icon: RotateCcw,
  },
  {
    id: "fiducia",
    title: "Voglio ritrovare fiducia",
    description: "Parti da ciò che sta limitando la tua prestazione adesso.",
    prompt:
      "In questo periodo sento meno fiducia durante allenamenti e gare. Aiutami a capire da dove partire con domande concrete.",
    icon: Target,
  },
] as const;

/**
 * Chat landing page - shows when no chat is selected.
 * Supports both authenticated users and guests.
 */
export default function ChatPage() {
  const { user } = useUser();
  const { createChat, chats, isGuest } = useChatContext();
  const greeting = isGuest
    ? "Benvenuto!"
    : `Ciao${user?.firstName ? `, ${user.firstName}` : ""}!`;

  return (
    <PageWrapper className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:p-8">
        <div className="w-full max-w-4xl text-center">
          <div className="mb-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
              <Brain className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display mt-4 text-4xl font-bold uppercase leading-none">
              {greeting}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Partiamo da ciò che sta succedendo davvero. Scegli una situazione
              o apri una conversazione libera.
            </p>
          </div>

          <div className="grid gap-3 text-left md:grid-cols-3">
            {starterPrompts.map((starter) => (
              <button
                key={starter.id}
                type="button"
                onClick={() =>
                  createChat({
                    draft: starter.prompt,
                    title: starter.title,
                  })
                }
                className="group flex min-h-40 flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg focus-visible:border-primary"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <starter.icon className="h-5 w-5" />
                </span>
                <span className="font-display mt-5 text-xl font-bold uppercase leading-none">
                  {starter.title}
                </span>
                <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {starter.description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-border" />
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              oppure
            </span>
            <span className="h-px w-8 bg-border" />
          </div>

          <Button
            onClick={() => createChat()}
            size="lg"
            variant="outline"
            className="mt-5 min-h-11 gap-2"
          >
            <Sparkles className="h-5 w-5" />
            Conversazione libera
          </Button>

          {chats.length > 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              Hai {chats.length} conversazion{chats.length !== 1 ? "i" : "e"}.
              Puoi riprenderle dalla barra laterale.
            </p>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
