import { revalidateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { invalidateCoachingContextPromptCaches } from "@/lib/ai/coaching-context-cache";
import { prisma } from "@/lib/db";
import { trackOnboardingEvent } from "./analytics";
import {
  ONBOARDING_FIELDS,
  ONBOARDING_QUESTIONS,
  ONBOARDING_VERSION,
} from "./constants";
import { interpretOnboardingAnswer } from "./model";
import {
  applyModelExtractionToState,
  createEmptyOnboardingState,
  isExplicitSkipText,
} from "./service";
import type {
  OnboardingDraft,
  OnboardingField,
  OnboardingMessage,
  OnboardingSessionDto,
  OnboardingState,
} from "./types";

type StoredMessage = OnboardingMessage & { requestId?: string };

export class OnboardingAlreadyCompleteError extends Error {}
export class OnboardingStepStaleError extends Error {}
export class OnboardingModelUnavailableError extends Error {}
export class OnboardingNotReadyError extends Error {}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseDraft(value: unknown): OnboardingDraft {
  const empty = createEmptyOnboardingState().draft;
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  return { ...empty, ...(value as Partial<OnboardingDraft>) };
}

function parseSkipped(value: unknown): OnboardingField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is OnboardingField =>
    ONBOARDING_FIELDS.includes(field as OnboardingField),
  );
}

function parseMessages(value: unknown): StoredMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (message): message is StoredMessage =>
      Boolean(message) &&
      typeof message === "object" &&
      typeof (message as StoredMessage).id === "string" &&
      typeof (message as StoredMessage).content === "string" &&
      ((message as StoredMessage).role === "assistant" ||
        (message as StoredMessage).role === "user"),
  );
}

function toState(session: {
  status: "IN_PROGRESS" | "REVIEW";
  currentStep: number;
  draft: unknown;
  skippedFields: unknown;
}): OnboardingState {
  return {
    status: session.status,
    currentStep: session.currentStep,
    draft: parseDraft(session.draft),
    skippedFields: parseSkipped(session.skippedFields),
  };
}

function toDto(
  state: OnboardingState,
  messages: StoredMessage[],
): OnboardingSessionDto {
  const item = ONBOARDING_QUESTIONS[state.currentStep];
  return {
    ...state,
    totalSteps: 5,
    currentField: item?.field ?? null,
    question: item?.question ?? null,
    skipLabel: item?.skipLabel ?? null,
    messages: messages.map(({ id, role, content }) => ({ id, role, content })),
  };
}

async function assertIncomplete(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });
  if (!user || user.onboardingCompletedAt) {
    throw new OnboardingAlreadyCompleteError();
  }
}

async function loadOrCreateSession(userId: string) {
  await assertIncomplete(userId);
  const firstQuestion = ONBOARDING_QUESTIONS[0];
  const initialMessages: StoredMessage[] = [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: firstQuestion.question,
    },
  ];
  return prisma.onboardingSession.upsert({
    where: { userId_version: { userId, version: ONBOARDING_VERSION } },
    update: {},
    create: {
      userId,
      version: ONBOARDING_VERSION,
      draft: jsonValue(createEmptyOnboardingState().draft),
      skippedFields: jsonValue([]),
      transcript: jsonValue(initialMessages),
    },
  });
}

export async function getOnboardingSessionDto(userId: string) {
  const session = await loadOrCreateSession(userId);
  return toDto(toState(session), parseMessages(session.transcript));
}

export async function applyOnboardingAnswer(input: {
  userId: string;
  expectedStep: number;
  userText: string;
  skip: boolean;
  requestId: string;
}) {
  const session = await loadOrCreateSession(input.userId);
  const state = toState(session);
  const messages = parseMessages(session.transcript);
  if (messages.some((message) => message.requestId === input.requestId)) {
    return toDto(state, messages);
  }
  if (
    state.status !== "IN_PROGRESS" ||
    state.currentStep !== input.expectedStep
  ) {
    throw new OnboardingStepStaleError();
  }
  const question = ONBOARDING_QUESTIONS[state.currentStep];
  if (!question) throw new OnboardingNotReadyError();

  const skip = input.skip || isExplicitSkipText(input.userText);
  const modelResult = skip
    ? {
        currentFieldStatus: "skipped" as const,
        extracted: {},
        clarification: null,
        assistantMessage:
          ONBOARDING_QUESTIONS[state.currentStep + 1]?.question ??
          "Rivediamo insieme il tuo profilo.",
      }
    : await interpretOnboardingAnswer({
        userId: input.userId,
        currentField: question.field,
        question: question.question,
        userText: input.userText,
        draft: state.draft,
        context: messages.slice(-8).map(({ role, content }) => ({
          role,
          content,
        })),
      });
  if ("unavailable" in modelResult && modelResult.unavailable) {
    throw new OnboardingModelUnavailableError();
  }

  const next = applyModelExtractionToState(state, modelResult);
  const userContent = input.userText.trim() || question.skipLabel;
  const nextMessages: StoredMessage[] = [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      requestId: input.requestId,
    },
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        next.status === "REVIEW"
          ? "Ci siamo. Controlla il profilo e modifica ciò che vuoi prima di iniziare."
          : modelResult.currentFieldStatus === "clarify"
            ? modelResult.assistantMessage
            : (ONBOARDING_QUESTIONS[next.currentStep]?.question ??
              modelResult.assistantMessage),
    },
  ];
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      status: next.status,
      currentStep: next.currentStep,
      draft: jsonValue(next.draft),
      skippedFields: jsonValue(next.skippedFields),
      transcript: jsonValue(nextMessages),
    },
  });
  trackOnboardingEvent(input.userId, "onboarding_step_completed", {
    version: ONBOARDING_VERSION,
    step: state.currentStep,
    skipped: modelResult.currentFieldStatus === "skipped",
    clarified: modelResult.currentFieldStatus === "clarify",
    reached_review: next.status === "REVIEW",
  });
  return toDto(toState(updated), parseMessages(updated.transcript));
}

export async function editOnboardingField(input: {
  userId: string;
  field: OnboardingField;
}) {
  const session = await loadOrCreateSession(input.userId);
  const state = toState(session);
  const draft = { ...state.draft };
  if (input.field === "sportOrSchool") {
    draft.sport = null;
    draft.experience = null;
  } else {
    draft[input.field] = null as never;
  }
  const currentStep = ONBOARDING_FIELDS.indexOf(input.field);
  const question = ONBOARDING_QUESTIONS[currentStep];
  const messages = [
    ...parseMessages(session.transcript),
    {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: question.question,
    },
  ];
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      status: "IN_PROGRESS",
      currentStep,
      draft: jsonValue(draft),
      skippedFields: jsonValue(
        state.skippedFields.filter((field) => field !== input.field),
      ),
      transcript: jsonValue(messages),
    },
  });
  return toDto(toState(updated), parseMessages(updated.transcript));
}

export async function confirmOnboarding(userId: string) {
  await assertIncomplete(userId);
  const session = await prisma.onboardingSession.findUnique({
    where: { userId_version: { userId, version: ONBOARDING_VERSION } },
  });
  if (!session || session.status !== "REVIEW")
    throw new OnboardingNotReadyError();
  const state = toState(session);
  const profileData = Object.fromEntries(
    Object.entries(state.draft).filter(([, value]) => value !== null),
  );

  await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    });
    const stamped = await tx.user.updateMany({
      where: { id: userId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
    if (stamped.count !== 1) throw new OnboardingAlreadyCompleteError();
  });

  revalidateTag("user-auth", "max");
  invalidateCoachingContextPromptCaches(userId);
  trackOnboardingEvent(userId, "onboarding_completed", {
    version: ONBOARDING_VERSION,
    skipped_fields: state.skippedFields.length,
  });
  return toDto(state, parseMessages(session.transcript));
}
