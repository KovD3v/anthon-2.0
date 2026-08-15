import type { ONBOARDING_FIELDS } from "./constants";

export type OnboardingField = (typeof ONBOARDING_FIELDS)[number];

export type OnboardingDraft = {
  name: string | null;
  age: number | null;
  occupation: string | null;
  sport: string | null;
  experience: string | null;
  goal: string | null;
};

export type OnboardingState = {
  status: "IN_PROGRESS" | "REVIEW";
  currentStep: number;
  draft: OnboardingDraft;
  skippedFields: OnboardingField[];
};

export type OnboardingModelResult = {
  currentFieldStatus: "accepted" | "skipped" | "clarify";
  extracted: Partial<OnboardingDraft>;
  assistantMessage: string;
  clarification: string | null;
};

export type OnboardingMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type OnboardingSessionDto = OnboardingState & {
  totalSteps: 5;
  currentField: OnboardingField | null;
  question: string | null;
  skipLabel: string | null;
  messages: OnboardingMessage[];
};
