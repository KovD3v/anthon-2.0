import { describe, expect, it } from "vitest";
import { ONBOARDING_FIELDS, ONBOARDING_QUESTIONS } from "./constants";
import {
  applyModelExtractionToState,
  createEmptyOnboardingState,
  isExplicitSkipText,
} from "./service";

describe("onboarding state machine", () => {
  it("keeps the approved five-question order", () => {
    expect(ONBOARDING_FIELDS).toEqual([
      "name",
      "age",
      "occupation",
      "sportOrSchool",
      "goal",
    ]);
    expect(ONBOARDING_QUESTIONS.map((item) => item.field)).toEqual(
      ONBOARDING_FIELDS,
    );
  });

  it.each(["", "niente", "Nessuno", "non lo so", "preferisco non dirlo"])(
    "recognizes an explicit skip answer: %s",
    (answer) => {
      expect(isExplicitSkipText(answer)).toBe(true);
    },
  );

  it("stores future fields and advances to the first unresolved field", () => {
    const result = applyModelExtractionToState(createEmptyOnboardingState(), {
      currentFieldStatus: "accepted",
      extracted: { name: "Giulia", age: 29, goal: "Più lucidità" },
      assistantMessage: "Perfetto.",
      clarification: null,
    });

    expect(result.draft).toMatchObject({
      name: "Giulia",
      age: 29,
      goal: "Più lucidità",
    });
    expect(result.currentStep).toBe(2);
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("does not advance when the current answer needs clarification", () => {
    const result = applyModelExtractionToState(createEmptyOnboardingState(), {
      currentFieldStatus: "clarify",
      extracted: { age: 29 },
      assistantMessage: "Come vuoi che ti chiami?",
      clarification: "Come vuoi che ti chiami?",
    });

    expect(result.currentStep).toBe(0);
    expect(result.draft.age).toBe(29);
    expect(result.draft.name).toBeNull();
  });

  it("keeps extracted values when the model marks a non-empty answer as skipped", () => {
    const state = createEmptyOnboardingState();
    state.currentStep = 3;
    state.draft = {
      name: "Antonio",
      age: 20,
      occupation: "studente di ingegneria informatica",
      sport: null,
      experience: null,
      goal: null,
    };

    const result = applyModelExtractionToState(state, {
      currentFieldStatus: "skipped",
      extracted: {
        sport: "palestra",
        experience: "secondo anno di università",
      },
      assistantMessage: "Perfetto.",
      clarification: null,
    });

    expect(result.skippedFields).not.toContain("sportOrSchool");
    expect(result.currentStep).toBe(4);
  });

  it("moves to review only after every field is resolved or skipped", () => {
    const state = createEmptyOnboardingState();
    state.draft = {
      name: "Giulia",
      age: 29,
      occupation: "Designer",
      sport: null,
      experience: null,
      goal: "Più lucidità",
    };
    state.skippedFields = ["sportOrSchool"];
    state.currentStep = 4;

    const result = applyModelExtractionToState(state, {
      currentFieldStatus: "accepted",
      extracted: { goal: "Più lucidità" },
      assistantMessage: "Rivediamo il profilo.",
      clarification: null,
    });

    expect(result.status).toBe("REVIEW");
    expect(result.currentStep).toBe(5);
  });
});
