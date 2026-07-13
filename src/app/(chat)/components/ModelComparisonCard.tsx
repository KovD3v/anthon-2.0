"use client";

import { Check, Loader2, Scale } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ModelComparisonChoice,
  ModelComparisonData,
  ModelComparisonSlot,
} from "@/lib/model-experiments/types";
import { cn } from "@/lib/utils";
import { MemoizedMarkdown } from "./MemoizedMarkdown";

const markdownClassName =
  "prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-a:text-foreground prose-code:text-foreground";

export function ModelComparisonCard({
  data,
  streamedText,
  onResolved,
}: {
  data: ModelComparisonData;
  streamedText?: Partial<Record<ModelComparisonSlot, string>>;
  onResolved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<ModelComparisonChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = data.status === "ready";

  async function vote(choice: ModelComparisonChoice) {
    if (!ready || saving) return;
    setSaving(choice);
    setError(null);
    try {
      const response = await fetch(
        `/api/chat/model-comparisons/${data.pairId}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice }),
        },
      );
      if (!response.ok) throw new Error("vote_failed");
      await onResolved();
    } catch {
      setError("Non sono riuscito a salvare la scelta. Riprova.");
      setSaving(null);
    }
  }

  return (
    <section className="w-full" aria-labelledby={`comparison-${data.pairId}`}>
      {data.noticeRequired && (
        <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
          Stai aiutandoci a confrontare due versioni di Anthon. Per alcuni
          messaggi vedrai due risposte anonime: scegli quella più utile. Non
          consuma richieste extra.
        </div>
      )}
      <fieldset disabled={!ready || Boolean(saving)} className="min-w-0">
        <legend
          id={`comparison-${data.pairId}`}
          className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Scale className="h-4 w-4 text-primary" aria-hidden="true" />
          Quale risposta ti è più utile?
        </legend>
        <div className="grid gap-3 md:grid-cols-2">
          {(["A", "B"] as const).map((slot) => {
            const response = data.slots[slot];
            const text = response.text || streamedText?.[slot] || "";
            return (
              <article
                key={slot}
                className="flex min-h-56 min-w-0 flex-col rounded-2xl border border-border/80 bg-background/80 shadow-sm"
              >
                <header className="flex items-center justify-between border-border/70 border-b px-4 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {slot}
                  </span>
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Risposta anonima
                  </span>
                </header>
                <div
                  className="min-h-0 flex-1 px-4 py-4"
                  aria-live="polite"
                  aria-atomic="false"
                >
                  {text ? (
                    <MemoizedMarkdown
                      content={text}
                      className={markdownClassName}
                    />
                  ) : response.status === "failed" ? (
                    <p className="text-sm text-muted-foreground">
                      Questa risposta non è disponibile.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      Sto preparando la risposta…
                    </div>
                  )}
                </div>
                <div className="border-border/70 border-t p-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full rounded-xl",
                      saving === slot && "border-primary text-primary",
                    )}
                    onClick={() => vote(slot)}
                  >
                    {saving === slot ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Preferisco questa
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-3 flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl text-muted-foreground"
            onClick={() => vote("TIE")}
          >
            {saving === "TIE" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Sono ugualmente utili
          </Button>
          {!ready && data.status !== "partial_failed" && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Puoi scegliere quando entrambe le risposte sono complete.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </fieldset>
    </section>
  );
}
