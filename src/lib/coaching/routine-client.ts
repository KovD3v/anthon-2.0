import { z } from "zod";
import {
  type RoutineCardData,
  routineCardDataSchema,
} from "@/lib/coaching/routine";

const routineResponseSchema = z
  .object({ routine: routineCardDataSchema })
  .strict();
const activeRoutineResponseSchema = z
  .object({ routine: routineCardDataSchema.nullable() })
  .strict();
const routineCollectionResponseSchema = z
  .object({
    routines: z.array(routineCardDataSchema),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type RoutineCollectionStatus = "ACTIVE" | "ARCHIVED";
export type RoutineCollection = z.infer<typeof routineCollectionResponseSchema>;

export type RoutineAttemptOutcome =
  | "HELPFUL"
  | "PARTIALLY_HELPFUL"
  | "NOT_HELPFUL";

export class RoutineClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "RoutineClientError";
  }
}

export async function fetchActiveRoutineForReturn(): Promise<RoutineCardData | null> {
  const { payload, status } = await requestJson(
    "/api/coaching/routines?mode=return",
  );
  const parsed = activeRoutineResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      status,
    );
  }
  return parsed.data.routine;
}

export async function fetchRoutineCollection(options: {
  status: RoutineCollectionStatus;
  cursor?: string;
  limit?: number;
}): Promise<RoutineCollection> {
  const params = new URLSearchParams({
    mode: "collection",
    status: options.status,
  });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit !== undefined) params.set("limit", String(options.limit));

  const { payload, status } = await requestJson(
    `/api/coaching/routines?${params.toString()}`,
  );
  const parsed = routineCollectionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      status,
    );
  }
  return parsed.data;
}

function messageForStatus(status: number): string {
  if (status === 409) {
    return "La routine non è più attiva. Aggiorna la chat e riprova.";
  }
  if (status === 422) {
    return "La proposta non è più valida. Aggiorna la chat e riprova.";
  }
  return "Operazione non riuscita. Riprova.";
}

async function requestRoutine(
  url: string,
  init: RequestInit,
): Promise<RoutineCardData> {
  const { payload, status } = await requestJson(url, init);

  const parsed = routineResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      status,
    );
  }
  return parsed.data.routine;
}

async function requestJson(
  url: string,
  init: RequestInit = {},
): Promise<{ payload: unknown; status: number }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new RoutineClientError(
      "Connessione non disponibile. Controlla la rete e riprova.",
      null,
    );
  }

  if (!response.ok) {
    throw new RoutineClientError(
      messageForStatus(response.status),
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      response.status,
    );
  }
  return { payload, status: response.status };
}

export function saveRoutineProposal(
  sourceAssistantMessageId: string,
): Promise<RoutineCardData> {
  return requestRoutine("/api/coaching/routines", {
    method: "POST",
    body: JSON.stringify({ sourceAssistantMessageId }),
  });
}

export function createRoutineAttempt(
  routineId: string,
  clientActionId: string,
  outcome?: RoutineAttemptOutcome,
  outcomeNote?: string | null,
): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/routines/${routineId}/attempts`, {
    method: "POST",
    body: JSON.stringify({
      clientActionId,
      ...(outcome ? { outcome } : {}),
      ...(outcomeNote !== undefined ? { outcomeNote } : {}),
    }),
  });
}

export function saveRoutineOutcome(
  attemptId: string,
  outcome: RoutineAttemptOutcome,
  outcomeNote?: string | null,
): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/attempts/${attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({
      outcome,
      ...(outcomeNote !== undefined ? { outcomeNote } : {}),
    }),
  });
}

export function archiveRoutine(routineId: string): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/routines/${routineId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ARCHIVED" }),
  });
}
