"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  LoaderCircle,
  Pencil,
  Send,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  OnboardingField,
  OnboardingSessionDto,
} from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

const fieldRows: Array<{
  field: OnboardingField;
  label: string;
  value: (state: OnboardingSessionDto) => string | null;
}> = [
  { field: "name", label: "Nome", value: (state) => state.draft.name },
  {
    field: "age",
    label: "Età",
    value: (state) =>
      state.draft.age === null ? null : `${state.draft.age} anni`,
  },
  {
    field: "occupation",
    label: "Lavoro o studio",
    value: (state) => state.draft.occupation,
  },
  {
    field: "sportOrSchool",
    label: "Sport o scuola",
    value: (state) =>
      [state.draft.sport, state.draft.experience].filter(Boolean).join(" · ") ||
      null,
  },
  { field: "goal", label: "Obiettivo", value: (state) => state.draft.goal },
];

function ProfilePanel({
  state,
  pending,
  onEdit,
  embedded = false,
}: {
  state: OnboardingSessionDto;
  pending: boolean;
  onEdit: (field: OnboardingField) => void;
  embedded?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className={cn(
        embedded ? "px-4 py-3" : "rounded-xl border bg-card p-5 shadow-sm",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold uppercase leading-none">
            Profilo in costruzione
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Si compone mentre parliamo.
          </p>
        </div>
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
      </div>

      <div className="divide-y divide-border/70 border-y border-border/70">
        {fieldRows.map(({ field, label, value }, index) => {
          const resolvedValue = value(state);
          const skipped = state.skippedFields.includes(field);
          return (
            <m.div
              layout
              key={field}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : index * 0.045 }}
              className="group py-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                    resolvedValue || skipped
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent",
                  )}
                >
                  <Check className="size-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 break-words text-sm font-medium">
                    {resolvedValue ??
                      (skipped ? "Non indicato" : "Da scoprire")}
                  </p>
                </div>
                {(resolvedValue || skipped) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full opacity-70 hover:opacity-100"
                    aria-label={`Modifica ${label}`}
                    disabled={pending}
                    onClick={() => onEdit(field)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            </m.div>
          );
        })}
      </div>
    </div>
  );
}

export function OnboardingClient({
  initialState,
  nextPath,
}: {
  initialState: OnboardingSessionDto;
  nextPath: string;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState(initialState);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const conversationChanged =
      state.messages.length + Number(Boolean(optimistic)) + Number(pending);
    if (conversationChanged < 0) return;
    endRef.current?.scrollIntoView?.({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [optimistic, pending, reducedMotion, state.messages]);

  const spring = reducedMotion
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 420, damping: 34 };

  async function submitAnswer(event?: FormEvent, skip = false) {
    event?.preventDefault();
    const text = input.trim();
    if (pending || (!skip && !text) || state.currentStep > 4) return;
    const shownText = skip ? (state.skipLabel ?? "Preferisco non dirlo") : text;
    setOptimistic(shownText);
    setInput("");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedStep: state.currentStep,
          text: shownText,
          skip,
          requestId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ?? "Non sono riuscito a leggere la risposta.",
        );
      }
      setState((await response.json()) as OnboardingSessionDto);
      setOptimistic(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non sono riuscito a leggere la risposta.",
      );
    } finally {
      setPending(false);
    }
  }

  async function editField(field: OnboardingField) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!response.ok)
        throw new Error("Non sono riuscito ad aprire il campo.");
      setState((await response.json()) as OnboardingSessionDto);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Riprova.",
      );
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/confirm", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Controlla il profilo e riprova.");
      router.replace(nextPath);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Riprova.",
      );
      setConfirming(false);
    }
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-[90rem] flex-col px-3 sm:px-5 lg:px-6">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border sm:h-18">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary">
              <Brain className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-xl font-bold uppercase leading-none tracking-tight">
                Anthon
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Prepariamo il tuo spazio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              Passaggio {Math.min(state.currentStep + 1, 5)} di 5
            </span>
            <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block sm:w-36">
              <m.div
                className="h-full rounded-full bg-primary"
                animate={{
                  width: `${Math.min((state.currentStep + 1) * 20, 100)}%`,
                }}
                transition={spring}
              />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 py-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-5">
          <section
            data-testid="onboarding-conversation"
            className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-muted/20 shadow-sm"
          >
            <details className="group shrink-0 border-b bg-card lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Profilo in costruzione
                <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="max-h-[38dvh] overflow-y-auto border-t">
                <ProfilePanel
                  state={state}
                  pending={pending}
                  onEdit={editField}
                  embedded
                />
              </div>
            </details>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-5 sm:px-6 sm:py-7">
              <div className="mx-auto max-w-3xl space-y-4">
                <AnimatePresence initial={false}>
                  {state.messages.map((message) => (
                    <m.div
                      layout
                      key={message.id}
                      initial={
                        reducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 12, scale: 0.98 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={spring}
                      className={cn(
                        "flex",
                        message.role === "user" && "justify-end",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[90%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[75%] sm:px-5 sm:py-3.5",
                          message.role === "assistant"
                            ? "rounded-tl-sm border-border/60 bg-card text-foreground"
                            : "rounded-tr-sm border-primary/15 bg-primary/10 text-foreground",
                        )}
                      >
                        {message.content}
                      </div>
                    </m.div>
                  ))}
                  {optimistic && (
                    <m.div
                      key="optimistic"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[90%] rounded-2xl rounded-tr-sm border border-primary/15 bg-primary/10 px-4 py-3 text-sm text-foreground shadow-sm sm:max-w-[75%] sm:px-5">
                        {optimistic}
                      </div>
                    </m.div>
                  )}
                  {pending && optimistic && (
                    <m.div
                      key="reading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      <LoaderCircle className="size-4 animate-spin" />
                      Anthon sta leggendo…
                    </m.div>
                  )}
                </AnimatePresence>

                {state.status === "REVIEW" && (
                  <m.div
                    initial={
                      reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring}
                    className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
                  >
                    <h2 className="font-display text-2xl font-bold uppercase leading-none tracking-tight sm:text-3xl">
                      Il tuo punto di partenza è pronto.
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      Puoi correggere qualsiasi dato. Anthon userà questo
                      contesto per non farti ripartire da zero.
                    </p>
                    <Button
                      type="button"
                      onClick={confirm}
                      disabled={confirming}
                      className="mt-5 h-11 px-5 font-semibold"
                    >
                      {confirming ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <ArrowRight className="size-4" />
                      )}
                      Conferma e inizia
                    </Button>
                  </m.div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {state.status === "IN_PROGRESS" && (
              <div className="shrink-0 border-t bg-card px-3 py-3 sm:px-6 sm:py-4">
                <form onSubmit={submitAnswer} className="mx-auto max-w-3xl">
                  <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-background p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
                    <Textarea
                      aria-label="La tua risposta"
                      value={input}
                      disabled={pending}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Scrivi come parleresti ad Anthon…"
                      className="max-h-36 min-h-11 resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={pending || !input.trim()}
                      aria-label="Invia risposta"
                      className="size-11 shrink-0 rounded-xl"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 px-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => submitAnswer(undefined, true)}
                      className="h-8 px-2 text-xs text-muted-foreground"
                    >
                      {state.skipLabel}
                    </Button>
                    <span className="hidden text-[0.68rem] text-muted-foreground sm:inline">
                      Invio per continuare · Maiuscolo + Invio per andare a capo
                    </span>
                  </div>
                </form>
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 lg:block">
            <div className="max-h-full overflow-y-auto">
              <ProfilePanel
                state={state}
                pending={pending}
                onEdit={editField}
              />
            </div>
          </aside>
        </div>

        {error && (
          <div
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
            role="alert"
          >
            <span>{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setError(null)}
            >
              Chiudi
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
