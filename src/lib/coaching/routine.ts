import { z } from "zod";

export const routineProposalSchema = z.object({
  title: z.string().trim().min(3).max(96),
  trigger: z.string().trim().min(3).max(280),
  durationLabel: z.string().trim().min(2).max(80).nullable().optional(),
  steps: z.array(z.string().trim().min(2).max(240)).min(2).max(3),
  completionCue: z.string().trim().min(3).max(280),
});

export type RoutineProposal = z.infer<typeof routineProposalSchema>;

const routineAttemptCardDataSchema = z.object({
  id: z.string(),
  attemptedAt: z.iso.datetime(),
  outcome: z.enum(["HELPFUL", "PARTIALLY_HELPFUL", "NOT_HELPFUL"]).nullable(),
  outcomeNote: z.string().nullable(),
  outcomeRecordedAt: z.iso.datetime().nullable(),
});

export const routineCardDataSchema = z.object({
  id: z.string(),
  sourceChatId: z.string().nullable(),
  sourceAssistantMessageId: z.string().nullable(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  proposal: routineProposalSchema,
  archivedAt: z.iso.datetime().nullable(),
  latestAttempt: routineAttemptCardDataSchema.nullable(),
});

const routineSourcePartSchema = z.object({
  type: z.literal("data-coachingRoutine"),
  data: routineProposalSchema,
});

const routineSourceTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

const routineSourceMessageSchema = z.object({
  id: z.string().min(1),
  role: z.literal("assistant"),
  parts: z.tuple([routineSourceTextPartSchema, routineSourcePartSchema]),
  createdAt: z.iso.datetime(),
});

const routineSourceHydrationPayloadSchema = z
  .object({
    messages: z.tuple([routineSourceMessageSchema]),
    routines: z.tuple([routineCardDataSchema]),
  })
  .passthrough();

export type RoutineCardData = {
  id: string;
  sourceChatId: string | null;
  sourceAssistantMessageId: string | null;
  status: "ACTIVE" | "ARCHIVED";
  proposal: RoutineProposal;
  archivedAt: string | null;
  latestAttempt: {
    id: string;
    attemptedAt: string;
    outcome: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL" | null;
    outcomeNote: string | null;
    outcomeRecordedAt: string | null;
  } | null;
};

export interface RoutineSourceHydrationTarget {
  routineId: string;
  sourceChatId: string;
  sourceAssistantMessageId: string;
}

export interface CanonicalRoutineSourceMessage {
  id: string;
  role: "assistant";
  content: null;
  parts: [
    { type: "text"; text: string },
    { type: "data-coachingRoutine"; data: RoutineProposal },
  ];
  createdAt: string;
}

export interface RoutineSourceHydrationData {
  message: CanonicalRoutineSourceMessage;
  routine: RoutineCardData;
}

type RoutineCardRecord = {
  id: string;
  sourceChatId: string | null;
  sourceAssistantMessageId: string | null;
  status: "ACTIVE" | "ARCHIVED";
  title: unknown;
  trigger: unknown;
  durationLabel?: unknown;
  steps: unknown;
  completionCue: unknown;
  archivedAt: Date | null;
  attempts: Array<{
    id: string;
    attemptedAt: Date;
    outcome: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL" | null;
    outcomeNote: string | null;
    outcomeRecordedAt: Date | null;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function areRoutineProposalsEqual(
  left: RoutineProposal,
  right: RoutineProposal,
): boolean {
  return (
    left.title === right.title &&
    left.trigger === right.trigger &&
    (left.durationLabel ?? null) === (right.durationLabel ?? null) &&
    left.completionCue === right.completionCue &&
    left.steps.length === right.steps.length &&
    left.steps.every((step, index) => step === right.steps[index])
  );
}

export function parseRoutineSourceHydrationPayload(
  payload: unknown,
  expected: RoutineSourceHydrationTarget,
): RoutineSourceHydrationData | null {
  const parsed = routineSourceHydrationPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const message = parsed.data.messages[0];
  const routine = parsed.data.routines[0];
  const proposal = message.parts[1].data;
  if (
    message.id !== expected.sourceAssistantMessageId ||
    routine.id !== expected.routineId ||
    routine.sourceChatId !== expected.sourceChatId ||
    routine.sourceAssistantMessageId !== expected.sourceAssistantMessageId ||
    !areRoutineProposalsEqual(proposal, routine.proposal)
  ) {
    return null;
  }

  return {
    message: {
      id: message.id,
      role: "assistant",
      content: null,
      parts: [
        { type: "text", text: message.parts[0].text },
        { type: "data-coachingRoutine", data: proposal },
      ],
      createdAt: message.createdAt,
    },
    routine,
  };
}

export function getRoutineProposalFromParts(
  parts: unknown,
): RoutineProposal | null {
  if (!Array.isArray(parts)) {
    return null;
  }

  const candidates = parts.filter(
    (part) => isRecord(part) && part.type === "data-coachingRoutine",
  );
  if (candidates.length !== 1) {
    return null;
  }

  const parsed = routineProposalSchema.safeParse(candidates[0]?.data);
  return parsed.success ? parsed.data : null;
}

export function getRoutineProposalFromToolCalls(
  toolCalls: unknown,
): RoutineProposal | null {
  if (!Array.isArray(toolCalls)) {
    return null;
  }

  const candidates = toolCalls.filter(
    (toolCall) => isRecord(toolCall) && toolCall.name === "proposeRoutine",
  );
  if (candidates.length !== 1) {
    return null;
  }

  const parsed = routineProposalSchema.safeParse(candidates[0]?.args);
  return parsed.success ? parsed.data : null;
}

export function toRoutineCardData(routine: RoutineCardRecord): RoutineCardData {
  const proposal = routineProposalSchema.parse({
    title: routine.title,
    trigger: routine.trigger,
    durationLabel: routine.durationLabel,
    steps: routine.steps,
    completionCue: routine.completionCue,
  });
  const latestAttempt = routine.attempts[0];

  return routineCardDataSchema.parse({
    id: routine.id,
    sourceChatId: routine.sourceChatId,
    sourceAssistantMessageId: routine.sourceAssistantMessageId,
    status: routine.status,
    proposal,
    archivedAt: routine.archivedAt?.toISOString() ?? null,
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          attemptedAt: latestAttempt.attemptedAt.toISOString(),
          outcome: latestAttempt.outcome,
          outcomeNote: latestAttempt.outcomeNote,
          outcomeRecordedAt:
            latestAttempt.outcomeRecordedAt?.toISOString() ?? null,
        }
      : null,
  });
}
