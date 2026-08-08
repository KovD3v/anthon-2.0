import { z } from "zod";

const normalizeWhitespace = (value: string) =>
  value.trim().replace(/\s+/g, " ");

const normalizedText = (min: number, max: number) =>
  z.string().transform(normalizeWhitespace).pipe(z.string().min(min).max(max));

const routineOutcomeSchema = z.enum([
  "HELPFUL",
  "PARTIALLY_HELPFUL",
  "NOT_HELPFUL",
]);

const routineStepIdSchema = normalizedText(1, 64);

const routineInstructionStepSchema = z
  .object({
    id: routineStepIdSchema,
    kind: z.literal("instruction"),
    text: normalizedText(2, 240),
  })
  .strict();

const routineTimerStepSchema = z
  .object({
    id: routineStepIdSchema,
    kind: z.literal("timer"),
    label: normalizedText(2, 80),
    instruction: normalizedText(2, 240),
    durationSeconds: z.number().int().min(5).max(900),
  })
  .strict();

const routineBreathingStepSchema = z
  .object({
    id: routineStepIdSchema,
    kind: z.literal("breathing"),
    label: normalizedText(2, 80),
    instruction: normalizedText(2, 240),
    inhaleSeconds: z.number().int().min(1).max(30),
    exhaleSeconds: z.number().int().min(1).max(30),
    holdAfterInhaleSeconds: z.number().int().min(0).max(30),
    holdAfterExhaleSeconds: z.number().int().min(0).max(30),
    cycles: z.number().int().min(1).max(12),
  })
  .strict();

const routineFormOptionSchema = z
  .object({
    label: normalizedText(2, 80),
    outcome: routineOutcomeSchema,
  })
  .strict();

const routineFormStepSchema = z
  .object({
    id: routineStepIdSchema,
    kind: z.literal("form"),
    question: normalizedText(3, 280),
    mode: z.enum(["scale", "choice"]),
    options: z.array(routineFormOptionSchema).length(3),
    noteEnabled: z.boolean(),
  })
  .strict()
  .superRefine((step, context) => {
    const outcomes = new Set(step.options.map((option) => option.outcome));
    if (outcomes.size !== 3) {
      context.addIssue({
        code: "custom",
        message: "Form options must map once to every routine outcome",
        path: ["options"],
      });
    }
  });

export type RoutineInstructionStep = z.infer<
  typeof routineInstructionStepSchema
>;
export type RoutineTimerStep = z.infer<typeof routineTimerStepSchema>;
export type RoutineBreathingStep = z.infer<typeof routineBreathingStepSchema>;
export type RoutineFormStep = z.infer<typeof routineFormStepSchema>;
export type RoutinePracticeStep =
  | RoutineInstructionStep
  | RoutineTimerStep
  | RoutineBreathingStep;
export type RoutineCompletionForm = RoutineFormStep;
export type RoutineStep = RoutinePracticeStep | RoutineCompletionForm;

const routineStepSchema = z.discriminatedUnion("kind", [
  routineInstructionStepSchema,
  routineTimerStepSchema,
  routineBreathingStepSchema,
  routineFormStepSchema,
]);

const routineProposalFields = {
  title: normalizedText(3, 96),
  trigger: normalizedText(3, 280),
  durationLabel: normalizedText(2, 80).nullable().optional(),
  completionCue: normalizedText(3, 280),
};

/** The persisted v1 shape used by existing assistant messages and routines. */
export const routineProposalV1Schema = z.object({
  ...routineProposalFields,
  steps: z.array(normalizedText(2, 240)).min(2).max(3),
});

/** The typed routine shape emitted by the v2 proposal tool. */
export const routineProposalV2Schema = z
  .object({
    formatVersion: z.literal(2),
    ...routineProposalFields,
    steps: z.array(routineStepSchema).min(1).max(7),
  })
  .superRefine((proposal, context) => {
    const formIndex = proposal.steps.findIndex((step) => step.kind === "form");
    const practiceSteps = proposal.steps.filter(
      (step): step is RoutinePracticeStep => step.kind !== "form",
    );
    const ids = new Set<string>();

    for (const [index, step] of proposal.steps.entries()) {
      if (ids.has(step.id)) {
        context.addIssue({
          code: "custom",
          message: "Routine step ids must be unique",
          path: ["steps", index, "id"],
        });
      }
      ids.add(step.id);
    }

    if (practiceSteps.length < 1 || practiceSteps.length > 6) {
      context.addIssue({
        code: "custom",
        message: "A routine must contain between one and six practice steps",
        path: ["steps"],
      });
    }

    if (formIndex !== -1 && formIndex !== proposal.steps.length - 1) {
      context.addIssue({
        code: "custom",
        message: "A completion form must be terminal",
        path: ["steps", formIndex],
      });
    }
  });

export const storedRoutineProposalSchema = z.union([
  routineProposalV1Schema,
  routineProposalV2Schema,
]);

/**
 * Backwards-compatible parser for persisted routine parts. Task 2 will wire
 * the proposal tool itself directly to routineProposalV2Schema.
 */
export const routineProposalSchema = storedRoutineProposalSchema;

export type RoutineProposalV1 = z.infer<typeof routineProposalV1Schema>;
export type RoutineProposalV2 = z.infer<typeof routineProposalV2Schema>;
export type StoredRoutineProposal = z.infer<typeof storedRoutineProposalSchema>;
export type RoutineProposal = StoredRoutineProposal;

export interface NormalizedRoutineProposal {
  formatVersion: 1 | 2;
  title: string;
  trigger: string;
  durationLabel: string | null;
  practiceSteps: RoutinePracticeStep[];
  completionForm: RoutineCompletionForm | null;
  completionCue: string;
}

export function normalizeRoutineProposal(
  proposal: StoredRoutineProposal,
): NormalizedRoutineProposal {
  const parsed = storedRoutineProposalSchema.parse(proposal);

  if ("formatVersion" in parsed) {
    const completionForm = parsed.steps.find(
      (step): step is RoutineCompletionForm => step.kind === "form",
    );

    return {
      formatVersion: 2,
      title: parsed.title,
      trigger: parsed.trigger,
      durationLabel: parsed.durationLabel ?? null,
      practiceSteps: parsed.steps.filter(
        (step): step is RoutinePracticeStep => step.kind !== "form",
      ),
      completionForm: completionForm ?? null,
      completionCue: parsed.completionCue,
    };
  }

  return {
    formatVersion: 1,
    title: parsed.title,
    trigger: parsed.trigger,
    durationLabel: parsed.durationLabel ?? null,
    practiceSteps: parsed.steps.map((text, index) => ({
      id: `instruction-${index + 1}`,
      kind: "instruction",
      text,
    })),
    completionForm: null,
    completionCue: parsed.completionCue,
  };
}

const routineAttemptCardDataSchema = z.object({
  id: z.string(),
  attemptedAt: z.iso.datetime(),
  outcome: routineOutcomeSchema.nullable(),
  outcomeNote: z.string().nullable(),
  outcomeRecordedAt: z.iso.datetime().nullable(),
});

export const routineCardDataSchema = z
  .object({
    id: z.string(),
    sourceChatId: z.string().nullable(),
    sourceAssistantMessageId: z.string().nullable(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    proposal: storedRoutineProposalSchema,
    archivedAt: z.iso.datetime().nullable(),
    latestAttempt: routineAttemptCardDataSchema.nullable(),
  })
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

const routineSourcePartSchema = z.object({
  type: z.literal("data-coachingRoutine"),
  data: storedRoutineProposalSchema,
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

export type RoutineCardData = z.infer<typeof routineCardDataSchema>;

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
    { type: "data-coachingRoutine"; data: StoredRoutineProposal },
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
  formatVersion?: unknown;
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
  left: StoredRoutineProposal,
  right: StoredRoutineProposal,
): boolean {
  const normalizedLeft = normalizeRoutineProposal(left);
  const normalizedRight = normalizeRoutineProposal(right);

  return (
    normalizedLeft.formatVersion === normalizedRight.formatVersion &&
    normalizedLeft.title === normalizedRight.title &&
    normalizedLeft.trigger === normalizedRight.trigger &&
    normalizedLeft.durationLabel === normalizedRight.durationLabel &&
    normalizedLeft.completionCue === normalizedRight.completionCue &&
    JSON.stringify(normalizedLeft.practiceSteps) ===
      JSON.stringify(normalizedRight.practiceSteps) &&
    JSON.stringify(normalizedLeft.completionForm) ===
      JSON.stringify(normalizedRight.completionForm)
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
): StoredRoutineProposal | null {
  if (!Array.isArray(parts)) return null;

  const candidates = parts.filter(
    (part) => isRecord(part) && part.type === "data-coachingRoutine",
  );
  if (candidates.length !== 1) return null;

  const parsed = storedRoutineProposalSchema.safeParse(candidates[0]?.data);
  return parsed.success ? parsed.data : null;
}

export function getRoutineProposalFromToolCalls(
  toolCalls: unknown,
): StoredRoutineProposal | null {
  if (!Array.isArray(toolCalls)) return null;

  const candidates = toolCalls.filter(
    (toolCall) => isRecord(toolCall) && toolCall.name === "proposeRoutine",
  );
  if (candidates.length !== 1) return null;

  const parsed = storedRoutineProposalSchema.safeParse(candidates[0]?.args);
  return parsed.success ? parsed.data : null;
}

export function toRoutineCardData(routine: RoutineCardRecord): RoutineCardData {
  const formatVersion = z
    .union([z.literal(1), z.literal(2)])
    .parse(routine.formatVersion ?? 1);
  const proposal =
    formatVersion === 1
      ? routineProposalV1Schema.parse({
          title: routine.title,
          trigger: routine.trigger,
          durationLabel: routine.durationLabel,
          steps: routine.steps,
          completionCue: routine.completionCue,
        })
      : routineProposalV2Schema.parse({
          formatVersion,
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
    formatVersion,
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
