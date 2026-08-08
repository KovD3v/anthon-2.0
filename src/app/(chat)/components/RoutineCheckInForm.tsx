"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoutineCardData } from "@/lib/coaching/routine";

export type RoutineAttemptOutcome =
  | "HELPFUL"
  | "PARTIALLY_HELPFUL"
  | "NOT_HELPFUL";

export type CreateRoutineAttempt = (
  routineId: string,
  outcome?: RoutineAttemptOutcome,
  outcomeNote?: string | null,
) => Promise<RoutineCardData>;

export type SaveRoutineOutcome = (
  attemptId: string,
  outcome: RoutineAttemptOutcome,
  outcomeNote?: string | null,
) => Promise<RoutineCardData>;

interface RoutineCheckInFormProps {
  routine: RoutineCardData;
  onCreateAttempt: CreateRoutineAttempt;
  onSaveOutcome: SaveRoutineOutcome;
}

const OUTCOMES: ReadonlyArray<{
  value: RoutineAttemptOutcome;
  label: string;
}> = [
  { value: "HELPFUL", label: "Mi ha aiutato" },
  { value: "PARTIALLY_HELPFUL", label: "In parte" },
  { value: "NOT_HELPFUL", label: "Non ha aiutato" },
];

export function RoutineCheckInForm({
  routine,
  onCreateAttempt,
  onSaveOutcome,
}: RoutineCheckInFormProps) {
  const [note, setNote] = useState("");
  const [pendingOutcome, setPendingOutcome] =
    useState<RoutineAttemptOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function submitOutcome(outcome: RoutineAttemptOutcome) {
    if (pendingOutcome) return;

    setError(null);
    setStatus(null);
    setPendingOutcome(outcome);
    const outcomeNote = note.trim() || null;

    try {
      if (routine.latestAttempt?.outcome === null) {
        await onSaveOutcome(routine.latestAttempt.id, outcome, outcomeNote);
      } else {
        await onCreateAttempt(routine.id, outcome, outcomeNote);
      }
      setStatus("Esito registrato");
    } catch {
      setError("Non siamo riusciti a registrare l'esito. Riprova.");
    } finally {
      setPendingOutcome(null);
    }
  }

  return (
    <fieldset className="mt-4 border-border/70 border-t pt-4">
      <legend className="px-1 font-display text-base font-bold uppercase tracking-tight text-foreground">
        Esito del tentativo
      </legend>
      <label
        htmlFor={`routine-note-${routine.id}`}
        className="mt-3 block text-xs font-medium text-muted-foreground"
      >
        Nota facoltativa
      </label>
      <textarea
        id={`routine-note-${routine.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={1000}
        disabled={pendingOutcome !== null}
        className="mt-1.5 w-full resize-y rounded-xl border border-border/80 bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        placeholder="Cosa hai notato?"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {OUTCOMES.map((outcome) => (
          <Button
            key={outcome.value}
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={pendingOutcome !== null}
            onClick={() => submitOutcome(outcome.value)}
          >
            {pendingOutcome === outcome.value && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {outcome.label}
          </Button>
        ))}
      </div>
      {pendingOutcome && (
        <output
          className="mt-3 block text-xs text-muted-foreground"
          aria-live="polite"
        >
          Registro l&apos;esito…
        </output>
      )}
      {status && !pendingOutcome && (
        <output
          className="mt-3 block text-xs font-medium text-foreground"
          aria-live="polite"
        >
          {status}
        </output>
      )}
      {error && (
        <p className="mt-3 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
