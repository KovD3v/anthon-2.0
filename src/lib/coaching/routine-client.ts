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
const strictRoutineOutcomeSchema = z.enum([
  "HELPFUL",
  "PARTIALLY_HELPFUL",
  "NOT_HELPFUL",
]);
const strictRoutineInstructionStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal("instruction"),
    text: z.string().min(2).max(240),
  })
  .strict();
const strictRoutineTimerStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal("timer"),
    label: z.string().min(2).max(80),
    instruction: z.string().min(2).max(240),
    durationSeconds: z.number().int().min(5).max(900),
  })
  .strict();
const strictRoutineBreathingStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal("breathing"),
    label: z.string().min(2).max(80),
    instruction: z.string().min(2).max(240),
    inhaleSeconds: z.number().int().min(1).max(30),
    exhaleSeconds: z.number().int().min(1).max(30),
    holdAfterInhaleSeconds: z.number().int().min(0).max(30),
    holdAfterExhaleSeconds: z.number().int().min(0).max(30),
    cycles: z.number().int().min(1).max(12),
  })
  .strict();
const strictRoutineFormOptionSchema = z
  .object({
    label: z.string().min(2).max(80),
    outcome: strictRoutineOutcomeSchema,
  })
  .strict();
const strictRoutineFormStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal("form"),
    question: z.string().min(3).max(280),
    mode: z.enum(["scale", "choice"]),
    options: z.array(strictRoutineFormOptionSchema).length(3),
    noteEnabled: z.boolean(),
  })
  .strict();
const strictRoutineV2StepSchema = z.discriminatedUnion("kind", [
  strictRoutineInstructionStepSchema,
  strictRoutineTimerStepSchema,
  strictRoutineBreathingStepSchema,
  strictRoutineFormStepSchema,
]);
const strictRoutineProposalFields = {
  title: z.string().min(3).max(96),
  trigger: z.string().min(3).max(280),
  durationLabel: z.string().min(2).max(80).nullable(),
  completionCue: z.string().min(3).max(280),
};
const strictRoutineProposalV1Schema = z
  .object({
    ...strictRoutineProposalFields,
    steps: z.array(z.string().min(2).max(240)).min(2).max(3),
  })
  .strict();
const strictRoutineProposalV2Schema = z
  .object({
    formatVersion: z.literal(2),
    ...strictRoutineProposalFields,
    steps: z.array(strictRoutineV2StepSchema).min(1).max(7),
  })
  .strict();
const strictRoutineProposalSchema = z.union([
  strictRoutineProposalV1Schema,
  strictRoutineProposalV2Schema,
]);
const strictRoutineAttemptSchema = z
  .object({
    id: z.string(),
    attemptedAt: z.iso.datetime(),
    outcome: strictRoutineOutcomeSchema.nullable(),
    outcomeNote: z.string().nullable(),
    outcomeRecordedAt: z.iso.datetime().nullable(),
  })
  .strict();
const strictRoutineCardDataSchema = z
  .object({
    id: z.string(),
    sourceChatId: z.string().nullable(),
    sourceAssistantMessageId: z.string().nullable(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    proposal: strictRoutineProposalSchema,
    archivedAt: z.iso.datetime().nullable(),
    latestAttempt: strictRoutineAttemptSchema.nullable(),
  })
  .strict()
  .superRefine((card, context) => {
    const proposalVersion = "formatVersion" in card.proposal ? 2 : 1;
    if (card.formatVersion !== proposalVersion) {
      context.addIssue({
        code: "custom",
        message: "Routine formatVersion must match its proposal",
        path: ["formatVersion"],
      });
    }
  });
const routineCollectionResponseSchema = z
  .object({
    routines: z.array(strictRoutineCardDataSchema),
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
