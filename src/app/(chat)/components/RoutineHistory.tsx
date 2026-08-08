"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoutineCardData } from "@/lib/coaching/routine";
import {
  fetchRoutineAttempts,
  type RoutineAttempt,
  RoutineClientError,
} from "@/lib/coaching/routine-client";

const outcomeLabel: Record<NonNullable<RoutineAttempt["outcome"]>, string> = {
  HELPFUL: "Mi ha aiutato",
  PARTIALLY_HELPFUL: "Mi ha aiutato in parte",
  NOT_HELPFUL: "Non mi ha aiutato",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function frequencyLabel(attempts: RoutineAttempt[]) {
  if (attempts.length === 0) return "Nessun tentativo registrato";
  if (attempts.length === 1) return "1 tentativo registrato";
  const newest = new Date(attempts[0].attemptedAt).getTime();
  const oldest = new Date(attempts.at(-1)?.attemptedAt ?? newest).getTime();
  const days = Math.max(1, Math.round((newest - oldest) / 86_400_000));
  return `${attempts.length} tentativi in ${days} giorni`;
}

export function RoutineHistory({ routine }: { routine: RoutineCardData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [attempts, setAttempts] = useState<RoutineAttempt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const latestAttemptKey = routine.latestAttempt
    ? `${routine.latestAttempt.id}:${routine.latestAttempt.outcome ?? "pending"}`
    : null;

  const load = useCallback(
    async (cursor?: string, _attemptVersion?: string | null) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetchRoutineAttempts(
          routine.id,
          cursor ? { cursor } : {},
        );
        setAttempts((current) => {
          const merged = cursor
            ? [...current, ...page.attempts]
            : page.attempts;
          return Array.from(
            new Map(merged.map((attempt) => [attempt.id, attempt])).values(),
          );
        });
        setNextCursor(page.nextCursor);
      } catch (cause) {
        setError(
          cause instanceof RoutineClientError
            ? cause.message
            : "Non siamo riusciti a caricare lo storico. Riprova.",
        );
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [routine.id],
  );

  function toggle() {
    setIsOpen((open) => !open);
  }

  useEffect(() => {
    if (!isOpen) return;
    setAttempts([]);
    setNextCursor(null);
    void load(undefined, latestAttemptKey);
  }, [isOpen, latestAttemptKey, load]);

  return (
    <div className="mt-4 border-border/70 border-t pt-3">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-11 rounded-full px-3 text-muted-foreground"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        Storico tentativi
      </Button>
      {isOpen && (
        <div className="mt-2 space-y-3 text-sm">
          {isLoading && attempts.length === 0 && (
            <output
              className="block text-xs text-muted-foreground"
              aria-live="polite"
            >
              Carico lo storico…
            </output>
          )}
          {attempts.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Frequenza recente: {frequencyLabel(attempts)}
              </p>
              <ul className="space-y-2" aria-label="Tentativi precedenti">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="rounded-lg bg-muted/50 p-3">
                    <p className="font-medium">
                      Ultimo esito:{" "}
                      {attempt.outcome
                        ? outcomeLabel[attempt.outcome]
                        : "Da registrare"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(attempt.attemptedAt)}
                    </p>
                    {attempt.outcomeNote && (
                      <p className="mt-2 leading-relaxed">
                        {attempt.outcomeNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
          {nextCursor && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 rounded-full px-4"
              disabled={isLoading}
              onClick={() => void load(nextCursor)}
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Carica altri tentativi
            </Button>
          )}
          {error && attempts.length === 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
            >
              Riprova
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
