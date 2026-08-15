import { describe, expect, it } from "vitest";
import { planTurn } from "./turn-plan";

function plan(overrides: Partial<Parameters<typeof planTurn>[0]> = {}) {
  return planTurn({
    userMessage: "Motivami",
    isGuest: false,
    isFirstTurn: false,
    inputOrigin: "text",
    outputMode: "text",
    webSearchEnabled: false,
    webFetchEnabled: false,
    fullMaxRawTurns: 10,
    ...overrides,
  });
}

describe("turn plan", () => {
  it("uses one full agentic plan without execution profile metadata", () => {
    const result = plan({ capabilityMode: "agentic" });

    expect(result.promptProfile).toBe("full");
    expect(result.history).toMatchObject({
      scope: "thread",
      maxRawTurns: 10,
      maxRawChars: 12_000,
    });
    expect(result).not.toHaveProperty("execution");
    expect(result).not.toHaveProperty("eligibleProfile");
    expect(result).not.toHaveProperty("plannedProfile");
  });

  it("keeps guest persistence disabled while retaining the guest prompt", () => {
    const result = plan({
      isGuest: true,
      isFirstTurn: false,
      userMessage: "Cerca le notizie di oggi",
      webSearchEnabled: true,
      webFetchEnabled: true,
    });

    expect(result.promptProfile).toBe("guest");
    expect(result.capabilities).toMatchObject({
      webSearch: true,
      webFetch: true,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      userContext: false,
    });
  });

  it("projects independently authorized web and RAG capabilities", () => {
    const result = plan({
      userMessage: "Cerca online fonti e confrontale con i documenti caricati",
      webSearchEnabled: true,
      webFetchEnabled: true,
      capabilityDecision: {
        webSearch: true,
        webFetch: true,
        rag: true,
        userContext: false,
        memoryRead: false,
        memoryWrite: false,
        memoryDelete: false,
        routineProposal: false,
        voiceOutput: false,
      },
    });

    expect(result.capabilities).toMatchObject({
      webSearch: true,
      webFetch: true,
      rag: true,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
    });
  });

  it("keeps exact memory-delete authorization deterministic", () => {
    const result = plan({
      userMessage: "Dimentica il mio programma di allenamento",
      memoryDeleteEnabled: true,
      memoryDeleteTarget: "training_schedule",
      capabilityDecision: {
        webSearch: false,
        webFetch: false,
        rag: false,
        userContext: true,
        memoryRead: false,
        memoryWrite: false,
        memoryDelete: true,
        routineProposal: false,
        voiceOutput: false,
      },
    });

    expect(result.capabilities.memoryDelete).toBe(true);
    expect(result.memoryDeleteTarget).toBe("training_schedule");
    expect(result.capabilities.userContext).toBe(true);
  });

  it("does not consume historical classifier output", () => {
    const result = plan({
      classifier: {
        accepted: true,
        rag: true,
        userContext: "needed",
      },
    });

    expect(result.capabilities.rag).toBe(false);
    expect(result.capabilities.userContext).toBe(false);
    expect(result.source).toBe("rule");
  });

  it("uses the full prompt for brief authenticated requests", () => {
    const result = plan({ userMessage: "Rispondi breve" });

    expect(result.responseLength).toBe("brief");
    expect(result.promptProfile).toBe("full");
  });
});
