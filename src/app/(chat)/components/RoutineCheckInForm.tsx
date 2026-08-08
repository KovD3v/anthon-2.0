"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  normalizeRoutineProposal,
  type RoutineCardData,
  type RoutineCompletionForm,
} from "@/lib/coaching/routine";
import { RoutineClientError } from "@/lib/coaching/routine-client";

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
  onSuccess?: (routine: RoutineCardData) => void;
  onFocused?: () => void;
}

const OUTCOMES: ReadonlyArray<{
  outcome: RoutineAttemptOutcome;
  label: string;
}> = [
  { outcome: "HELPFUL", label: "Mi ha aiutato" },
  { outcome: "PARTIALLY_HELPFUL", label: "In parte" },
  { outcome: "NOT_HELPFUL", label: "Non ha aiutato" },
];

function getStructuredOutcomes(completionForm: RoutineCompletionForm | null) {
  return OUTCOMES.map((fallback) => ({
    outcome: fallback.outcome,
    label:
      completionForm?.options.find(
        (option) => option.outcome === fallback.outcome,
      )?.label ?? fallback.label,
  }));
}

export function RoutineCheckInForm({
  routine,
  onSaveOutcome,
  onSuccess,
  onFocused,
}: RoutineCheckInFormProps) {
  const [note, setNote] = useState("");
  const [pendingOutcome, setPendingOutcome] =
    useState<RoutineAttemptOutcome | null>(null);
  const [selectedOutcome, setSelectedOutcome] =
    useState<RoutineAttemptOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const onFocusedRef = useRef(onFocused);
  onFocusedRef.current = onFocused;
  const didAttemptFocusRef = useRef(false);
  const didReportFocusRef = useRef(false);
  const completionForm = normalizeRoutineProposal(
    routine.proposal,
  ).completionForm;
  const outcomes = getStructuredOutcomes(completionForm);
  const question = completionForm?.question ?? "Esito del tentativo";
  const isNoteEnabled = completionForm?.noteEnabled ?? true;
  const pendingAttempt =
    routine.latestAttempt?.outcome === null ? routine.latestAttempt : null;

  useEffect(() => {
    if (!pendingAttempt) return;
    if (didAttemptFocusRef.current) return;
    didAttemptFocusRef.current = true;
    noteRef.current?.focus();
    if (
      !didReportFocusRef.current &&
      noteRef.current &&
      document.activeElement === noteRef.current
    ) {
      didReportFocusRef.current = true;
      onFocusedRef.current?.();
    }
  }, [pendingAttempt]);

  async function submitOutcome(outcome: RoutineAttemptOutcome) {
    if (!pendingAttempt || pendingOutcome) return;

    setSelectedOutcome(outcome);
    setError(null);
    setStatus(null);
    setPendingOutcome(outcome);
    const outcomeNote = isNoteEnabled ? note.trim() || null : null;

    try {
      const updatedRoutine = await onSaveOutcome(
        pendingAttempt.id,
        outcome,
        outcomeNote,
      );
      onSuccess?.(updatedRoutine);
      setStatus("Esito registrato");
    } catch (cause) {
      setError(
        cause instanceof RoutineClientError
          ? cause.message
          : "Non siamo riusciti a registrare l'esito. Riprova.",
      );
    } finally {
      setPendingOutcome(null);
    }
  }

  if (!pendingAttempt) {
    return (
      <output className="mt-4 block text-sm text-muted-foreground">
        Il check-in sarà disponibile dopo il completamento della routine.
      </output>
    );
  }

  return (
    <fieldset className="mt-4 border-border/70 border-t pt-4">
      <legend className="px-1 font-display text-base font-bold uppercase tracking-tight text-foreground">
        {question}
      </legend>
      {isNoteEnabled && (
        <>
          <label
            htmlFor={`routine-note-${routine.id}`}
            className="mt-3 block text-xs font-medium text-muted-foreground"
          >
            Nota facoltativa
          </label>
          <textarea
            ref={noteRef}
            data-routine-check-in-id={routine.id}
            id={`routine-note-${routine.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            disabled={pendingOutcome !== null}
            className="mt-1.5 w-full resize-y rounded-xl border border-border/80 bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
            placeholder="Cosa hai notato?"
          />
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {outcomes.map((outcome) => (
          <Button
            key={outcome.outcome}
            type="button"
            size="sm"
            variant={
              selectedOutcome === outcome.outcome ? "default" : "outline"
            }
            className="min-h-11 rounded-full px-4"
            disabled={pendingOutcome !== null}
            aria-pressed={selectedOutcome === outcome.outcome}
            onClick={() => submitOutcome(outcome.outcome)}
          >
            {pendingOutcome === outcome.outcome && (
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
