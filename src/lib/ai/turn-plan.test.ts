import { describe, expect, it } from "vitest";
import { planLegacyTurn, planTurn } from "./turn-plan";

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
  it("keeps atomic coaching compact without removing a normal output budget", () => {
    const result = plan();

    expect(result.promptProfile).toBe("compact");
    expect(result.responseLength).toBe("normal");
    expect(result.history).toMatchObject({
      scope: "thread",
      maxRawTurns: 3,
      maxRawChars: 4_000,
    });
  });

  it("treats brevity as output policy rather than compact eligibility", () => {
    const result = plan({
      userMessage: "La storia la voglio più breve",
    });

    expect(result.responseLength).toBe("brief");
    expect(result.promptProfile).toBe("full");
    expect(result.capabilities.userContext).toBe(true);
  });

  it("promotes accepted classifier RAG and user-context decisions", () => {
    const result = plan({
      userMessage: "Rispondi breve",
      classifier: {
        accepted: true,
        rag: true,
        userContext: "needed",
      },
    });

    expect(result.promptProfile).toBe("full");
    expect(result.capabilities.rag).toBe(true);
    expect(result.capabilities.userContext).toBe(true);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["RAG_CLASSIFIER", "USER_CONTEXT_CLASSIFIER"]),
    );
  });

  it("keeps a successful voice transcription semantically text-first", () => {
    const result = plan({ inputOrigin: "transcribed_voice" });

    expect(result.promptProfile).toBe("compact");
    expect(result.inputOrigin).toBe("transcribed_voice");
  });

  it("allows guest current-information turns to retain web search only", () => {
    const result = plan({
      isGuest: true,
      userMessage: "Che risultato ha fatto ieri l'Italia?",
      webSearchEnabled: true,
    });

    expect(result.promptProfile).toBe("guest");
    expect(result.capabilities.webSearch).toBe(true);
    expect(result.capabilities.memoryRead).toBe(false);
  });

  it("keeps direct media on the full profile", () => {
    const result = plan({ inputOrigin: "direct_media" });

    expect(result.promptProfile).toBe("full");
    expect(result.reasonCodes).toContain("DIRECT_MEDIA");
  });

  it("preserves the old broad compact matcher for the explicit legacy switch", () => {
    const result = planLegacyTurn({
      userMessage: "Rispondi breve",
      isGuest: false,
      isFirstTurn: false,
      inputOrigin: "text",
      outputMode: "text",
      webSearchEnabled: false,
      webFetchEnabled: false,
      fullMaxRawTurns: 10,
    });

    expect(result.promptProfile).toBe("compact");
    expect(result.history.includeSummary).toBe(false);
  });

  it("does not let legacy mode remove classifier capabilities", () => {
    const result = planLegacyTurn({
      userMessage: "Controlla online, risposta rapida",
      isGuest: false,
      isFirstTurn: false,
      inputOrigin: "text",
      outputMode: "text",
      webSearchEnabled: false,
      webFetchEnabled: false,
      classifier: { accepted: true, webSearch: true },
      fullMaxRawTurns: 10,
    });

    expect(result.promptProfile).toBe("full");
    expect(result.capabilities.webSearch).toBe(true);
  });

  it("keeps voice output and explicit voice requests out of legacy compact mode", () => {
    const voiceOutput = planLegacyTurn({
      userMessage: "Motivami",
      isGuest: false,
      isFirstTurn: false,
      inputOrigin: "text",
      outputMode: "voice",
      webSearchEnabled: false,
      webFetchEnabled: false,
      fullMaxRawTurns: 10,
    });
    const explicitVoiceRequest = planLegacyTurn({
      userMessage: "Mandami un vocale breve",
      isGuest: false,
      isFirstTurn: false,
      inputOrigin: "text",
      outputMode: "text",
      webSearchEnabled: false,
      webFetchEnabled: false,
      fullMaxRawTurns: 10,
    });

    expect(voiceOutput.promptProfile).toBe("full");
    expect(voiceOutput.capabilities.userContext).toBe(true);
    expect(voiceOutput.outputMode).toBe("voice");
    expect(explicitVoiceRequest.promptProfile).toBe("full");
  });
});
