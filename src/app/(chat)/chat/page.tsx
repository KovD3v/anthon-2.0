"use client";

import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  Brain,
  CalendarClock,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/ui/page-wrapper";
import {
  createRoutineAttempt,
  type RoutineAttemptOutcome,
  saveRoutineOutcome,
} from "@/lib/coaching/routine-client";
import { RoutineCheckInForm } from "../components/RoutineCheckInForm";
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
  const {
    createChat,
    navigateToChat,
    chats,
    coachingGoal,
    isGuest,
    activeRoutine,
    chatNavigationEpoch,
    refreshActiveRoutine,
    openRoutineCheckIn,
  } = useChatContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedPrefilledChatRef = useRef(false);
  const handledCheckInParamRef = useRef<string | null>(null);
  const routineAttemptActionIdsRef = useRef(new Map<string, string>());
  const [landingCheckInRequest, setLandingCheckInRequest] = useState<{
    routineId: string;
    navigationEpoch: number;
  } | null>(null);
  const prefilledPrompt = searchParams.get("q")?.trim() ?? "";
  const checkInRoutineId = searchParams.get("checkInRoutineId")?.trim() ?? "";

  useEffect(() => {
    if (
      checkInRoutineId ||
      !prefilledPrompt ||
      startedPrefilledChatRef.current
    ) {
      return;
    }
    startedPrefilledChatRef.current = true;
    createChat({
      initialMessage: prefilledPrompt,
      title: "Percorso dalla home",
    });
  }, [checkInRoutineId, createChat, prefilledPrompt]);

  useEffect(() => {
    if (!checkInRoutineId) {
      handledCheckInParamRef.current = null;
      return;
    }
    if (handledCheckInParamRef.current === checkInRoutineId) return;
    handledCheckInParamRef.current = checkInRoutineId;

    if (!activeRoutine || activeRoutine.id !== checkInRoutineId) {
      router.replace("/chat");
      return;
    }

    if (activeRoutine.sourceChatId && activeRoutine.sourceAssistantMessageId) {
      openRoutineCheckIn(activeRoutine);
      return;
    }

    setLandingCheckInRequest({
      routineId: activeRoutine.id,
      navigationEpoch: chatNavigationEpoch,
    });
  }, [
    activeRoutine,
    chatNavigationEpoch,
    checkInRoutineId,
    openRoutineCheckIn,
    router,
  ]);

  const handleCreateRoutineAttempt = useCallback(
    async (
      routineId: string,
      outcome?: RoutineAttemptOutcome,
      outcomeNote?: string | null,
    ) => {
      const normalizedOutcomeNote = outcomeNote?.trim() || null;
      const actionKey = JSON.stringify({
        routineId,
        outcome: outcome ?? null,
        outcomeNote: normalizedOutcomeNote,
      });
      let clientActionId = routineAttemptActionIdsRef.current.get(actionKey);
      if (!clientActionId) {
        clientActionId = crypto.randomUUID();
        routineAttemptActionIdsRef.current.set(actionKey, clientActionId);
      }

      const routine = await createRoutineAttempt(
        routineId,
        clientActionId,
        outcome,
        normalizedOutcomeNote,
      );
      routineAttemptActionIdsRef.current.delete(actionKey);
      await refreshActiveRoutine();
      return routine;
    },
    [refreshActiveRoutine],
  );

  const handleSaveRoutineOutcome = useCallback(
    async (
      attemptId: string,
      outcome: RoutineAttemptOutcome,
      outcomeNote?: string | null,
    ) => {
      const routine = await saveRoutineOutcome(attemptId, outcome, outcomeNote);
      await refreshActiveRoutine();
      return routine;
    },
    [refreshActiveRoutine],
  );

  const greeting = isGuest
    ? "Benvenuto!"
    : `Ciao${user?.firstName ? `, ${user.firstName}` : ""}!`;
  const mostRecentChat =
    !isGuest && chats.length > 0
      ? [...chats].sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
            left.id.localeCompare(right.id),
        )[0]
      : null;
  const landingCheckInRoutine =
    activeRoutine?.id === landingCheckInRequest?.routineId &&
    landingCheckInRequest?.navigationEpoch === chatNavigationEpoch
      ? activeRoutine
      : null;
  const hasReturningPath = mostRecentChat !== null || activeRoutine !== null;

  return (
    <PageWrapper className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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

          {landingCheckInRoutine && (
            <section className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-primary">
                Check-in routine
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold uppercase leading-none">
                {landingCheckInRoutine.proposal.title}
              </h2>
              <RoutineCheckInForm
                routine={landingCheckInRoutine}
                onCreateAttempt={handleCreateRoutineAttempt}
                onSaveOutcome={handleSaveRoutineOutcome}
                onFocused={() => router.replace("/chat")}
                onSuccess={() => setLandingCheckInRequest(null)}
              />
            </section>
          )}

          {hasReturningPath && (
            <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-primary">
                Riprendi il percorso
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold uppercase leading-none">
                {mostRecentChat?.title ?? activeRoutine?.proposal.title}
              </h2>
              {coachingGoal && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Il tuo obiettivo: {coachingGoal}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Ultimo aggiornamento{" "}
                {mostRecentChat
                  ? new Intl.DateTimeFormat("it-IT", {
                      day: "numeric",
                      month: "short",
                    }).format(new Date(mostRecentChat.updatedAt))
                  : "routine salvata"}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {mostRecentChat && (
                  <Button
                    className="gap-2"
                    onClick={() => navigateToChat(mostRecentChat.id)}
                  >
                    Riprendi
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (activeRoutine) {
                      openRoutineCheckIn(activeRoutine);
                      return;
                    }
                    createChat({
                      title: "Check-in sul percorso",
                      initialMessage:
                        "Vorrei fare un check-in sul mio percorso dall'ultima conversazione. Fammi una domanda alla volta per capire cosa è successo, cosa ha funzionato e dove mi sono bloccato.",
                    });
                  }}
                >
                  Com&apos;è andata?
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 text-left md:grid-cols-3">
            {starterPrompts.map((starter) => (
              <button
                key={starter.id}
                type="button"
                onClick={() =>
                  createChat({
                    initialMessage: starter.prompt,
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
          {chats.length > 0 && !mostRecentChat && (
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
