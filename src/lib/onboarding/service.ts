import { ONBOARDING_FIELDS } from "./constants";
import { onboardingAgeSchema, onboardingTextSchema } from "./schemas";
import type {
  OnboardingDraft,
  OnboardingField,
  OnboardingModelResult,
  OnboardingState,
} from "./types";

export function createEmptyOnboardingState(): OnboardingState {
  return {
    status: "IN_PROGRESS",
    currentStep: 0,
    draft: {
      name: null,
      age: null,
      occupation: null,
      sport: null,
      experience: null,
      goal: null,
    },
    skippedFields: [],
  };
}

export function isExplicitSkipText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("it-IT");
  return (
    normalized === "" ||
    normalized === "niente" ||
    normalized === "nessuno" ||
    normalized === "nessuna" ||
    normalized === "non lo so" ||
    normalized === "preferisco non dirlo"
  );
}

function cleanText(value: unknown): string | null | undefined {
  if (value === null) return null;
  const parsed = onboardingTextSchema.safeParse(value);
  return parsed.success && parsed.data ? parsed.data : undefined;
}

function validatedExtraction(
  extracted: Partial<OnboardingDraft>,
): Partial<OnboardingDraft> {
  const age = onboardingAgeSchema.safeParse(extracted.age);
  return {
    ...(cleanText(extracted.name) !== undefined
      ? { name: cleanText(extracted.name) }
      : {}),
    ...(age.success ? { age: age.data } : {}),
    ...(cleanText(extracted.occupation) !== undefined
      ? { occupation: cleanText(extracted.occupation) }
      : {}),
    ...(cleanText(extracted.sport) !== undefined
      ? { sport: cleanText(extracted.sport) }
      : {}),
    ...(cleanText(extracted.experience) !== undefined
      ? { experience: cleanText(extracted.experience) }
      : {}),
    ...(cleanText(extracted.goal) !== undefined
      ? { goal: cleanText(extracted.goal) }
      : {}),
  };
}

function fieldHasValue(field: OnboardingField, draft: OnboardingDraft) {
  if (field === "sportOrSchool") {
    return Boolean(draft.sport || draft.experience);
  }
  return draft[field] !== null;
}

function firstUnresolvedStep(state: OnboardingState): number | null {
  const index = ONBOARDING_FIELDS.findIndex(
    (field) =>
      !state.skippedFields.includes(field) &&
      !fieldHasValue(field, state.draft),
  );
  return index === -1 ? null : index;
}

export function applyModelExtractionToState(
  state: OnboardingState,
  result: OnboardingModelResult,
): OnboardingState {
  const currentField = ONBOARDING_FIELDS[state.currentStep];
  const next: OnboardingState = {
    ...state,
    draft: { ...state.draft, ...validatedExtraction(result.extracted) },
    skippedFields: [...state.skippedFields],
  };

  if (!currentField || result.currentFieldStatus === "clarify") return next;

  if (result.currentFieldStatus === "skipped") {
    next.skippedFields = Array.from(
      new Set([...next.skippedFields, currentField]),
    );
  }

  const currentResolved =
    next.skippedFields.includes(currentField) ||
    fieldHasValue(currentField, next.draft);
  if (!currentResolved) return next;

  const unresolvedStep = firstUnresolvedStep(next);
  if (unresolvedStep === null) {
    next.status = "REVIEW";
    next.currentStep = ONBOARDING_FIELDS.length;
    return next;
  }

  next.currentStep = unresolvedStep;
  return next;
}
