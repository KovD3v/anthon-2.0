"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
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
}: {
  state: OnboardingSessionDto;
  pending: boolean;
  onEdit: (field: OnboardingField) => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="rounded-[2rem] border border-foreground/10 bg-background/80 p-5 shadow-[0_30px_90px_-45px_rgba(18,24,10,0.65)] backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Profilo in costruzione
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            Si compone mentre parliamo.
          </p>
        </div>
        <Sparkles className="size-5 text-[#aab63b]" aria-hidden="true" />
      </div>

      <div className="space-y-2.5">
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
              className={cn(
                "group rounded-2xl border px-4 py-3 transition-colors",
                resolvedValue || skipped
                  ? "border-[#aab63b]/30 bg-[#dce66d]/12"
                  : "border-foreground/7 bg-foreground/[0.025]",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                    resolvedValue || skipped
                      ? "border-[#aab63b] bg-[#cbd650] text-[#20250d]"
                      : "border-foreground/15 text-transparent",
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
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#f6f5ed] text-[#1c2112] dark:bg-[#12140d] dark:text-[#f3f2e8]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <m.div
          animate={
            reducedMotion
              ? undefined
              : { x: [0, 24, -10, 0], y: [0, -16, 10, 0] }
          }
          transition={{
            duration: 13,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="absolute -left-24 -top-24 size-[28rem] rounded-full bg-[#dce66d]/35 blur-3xl dark:bg-[#9daa35]/15"
        />
        <div className="absolute -bottom-40 right-[-8rem] size-[34rem] rounded-full bg-[#d5b68a]/25 blur-3xl dark:bg-[#785f3d]/10" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:radial-gradient(currentColor_0.8px,transparent_0.8px)] [background-size:16px_16px]" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-[92rem] flex-col px-3 sm:px-6 lg:px-10">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-foreground/8 sm:h-24">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#cbd650] text-[#20250d] shadow-[0_12px_30px_-14px_rgba(83,93,24,0.8)]">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-serif text-xl font-semibold tracking-[-0.02em]">
                Anthon
              </p>
              <p className="text-xs text-muted-foreground">
                Prepariamo il tuo spazio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {Math.min(state.currentStep + 1, 5)} di 5
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/8 sm:w-36">
              <m.div
                className="h-full rounded-full bg-[#aab63b]"
                animate={{
                  width: `${Math.min((state.currentStep + 1) * 20, 100)}%`,
                }}
                transition={spring}
              />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8 lg:py-8">
          <section className="relative flex min-h-[70vh] flex-col overflow-hidden rounded-[2.25rem] border border-foreground/8 bg-background/55 shadow-[0_30px_100px_-60px_rgba(18,24,10,0.8)] backdrop-blur-md">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-9">
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
                          "max-w-[86%] rounded-[1.4rem] px-4 py-3 text-[0.96rem] leading-relaxed sm:max-w-[72%] sm:px-5",
                          message.role === "assistant"
                            ? "rounded-tl-md bg-[#dce66d] text-[#20250d] shadow-[0_14px_40px_-24px_rgba(78,88,18,0.85)]"
                            : "rounded-tr-md bg-[#22271a] text-[#f8f7ef] dark:bg-[#ecebdc] dark:text-[#1c2112]",
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
                      <div className="max-w-[86%] rounded-[1.4rem] rounded-tr-md bg-[#22271a] px-4 py-3 text-[0.96rem] text-[#f8f7ef] sm:max-w-[72%] sm:px-5 dark:bg-[#ecebdc] dark:text-[#1c2112]">
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
                    className="mt-8 rounded-[1.8rem] border border-[#aab63b]/35 bg-[#dce66d]/12 p-5 sm:p-7"
                  >
                    <p className="font-serif text-2xl font-semibold tracking-[-0.02em]">
                      Il tuo punto di partenza è pronto.
                    </p>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/65">
                      Puoi correggere qualsiasi dato. Anthon userà questo
                      contesto per non farti ripartire da zero.
                    </p>
                    <Button
                      type="button"
                      onClick={confirm}
                      disabled={confirming}
                      className="mt-6 h-12 rounded-full bg-[#22271a] px-6 text-[#f8f7ef] hover:bg-[#303723] dark:bg-[#dce66d] dark:text-[#20250d]"
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
              <div className="border-t border-foreground/8 bg-background/75 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-5">
                <form onSubmit={submitAnswer} className="mx-auto max-w-3xl">
                  <div className="flex items-end gap-2 rounded-[1.7rem] border border-foreground/10 bg-background p-2 shadow-[0_18px_50px_-32px_rgba(18,24,10,0.7)] focus-within:border-[#aab63b]/60">
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
                      className="size-11 shrink-0 rounded-full bg-[#cbd650] text-[#20250d] hover:bg-[#b9c542]"
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
                      className="h-8 rounded-full px-3 text-xs text-muted-foreground"
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

          <aside className="hidden lg:block">
            <div className="sticky top-8">
              <ProfilePanel
                state={state}
                pending={pending}
                onEdit={editField}
              />
            </div>
          </aside>

          <details className="group lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3 text-sm font-medium backdrop-blur-xl">
              Profilo in costruzione
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3">
              <ProfilePanel
                state={state}
                pending={pending}
                onEdit={editField}
              />
            </div>
          </details>
        </div>

        {error && (
          <div
            className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-destructive/20 bg-background px-4 py-2 text-sm shadow-xl"
            role="alert"
          >
            <span>{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full"
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
