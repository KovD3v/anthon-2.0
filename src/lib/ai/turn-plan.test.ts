import { describe, expect, it } from "vitest";
import {
  buildPlannedExecution,
  type ExecutionDecision,
} from "./execution-routing";
import { planLegacyTurn, planTurn } from "./turn-plan";

const standardExecutionDecision: ExecutionDecision = {
  eligibleProfile: "standard",
  taskKind: "coaching",
  contextDependency: "deep",
  source: "rule",
  confidenceBucket: "high",
  reasonCodes: [],
  policyVersion: 1,
  classifierVersion: 1,
};

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
    executionDecision: standardExecutionDecision,
    plannedExecution: buildPlannedExecution({
      decision: standardExecutionDecision,
      fastPathEnabled: false,
    }),
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

  it("projects a self-contained light execution into a zero-history bundle", () => {
    const executionDecision: ExecutionDecision = {
      ...standardExecutionDecision,
      eligibleProfile: "light",
      taskKind: "rewrite",
      contextDependency: "none",
      source: "rule",
    };
    const lightSelfContained = plan({
      userMessage: "Riscrivi questa frase in modo più chiaro.",
      executionDecision,
      plannedExecution: buildPlannedExecution({
        decision: executionDecision,
        fastPathEnabled: true,
      }),
    });

    expect(lightSelfContained.execution).toMatchObject({
      routingMode: "active",
      eligibleProfile: "light",
      plannedProfile: "light",
      primary: {
        profile: "light",
        promptProfile: "light",
        toolPolicy: "none",
        reasoningBudget: "minimal",
        maxOutputTokens: 600,
      },
    });
    expect(lightSelfContained.history).toEqual({
      scope: "none",
      includeSummary: false,
      maxRawTurns: 0,
      maxRawChars: 0,
    });
  });

  it("keeps one exact recent turn for a light reference", () => {
    const executionDecision: ExecutionDecision = {
      ...standardExecutionDecision,
      eligibleProfile: "light",
      taskKind: "rewrite",
      contextDependency: "recent",
      source: "rule",
    };
    const lightRecent = plan({
      userMessage: "Rendilo più breve.",
      executionDecision,
      plannedExecution: buildPlannedExecution({
        decision: executionDecision,
        fastPathEnabled: true,
      }),
    });

    expect(lightRecent.history).toEqual({
      scope: "thread",
      includeSummary: false,
      maxRawTurns: 1,
      maxRawChars: 4_000,
    });
  });

  it("keeps a disabled fast path on the existing standard execution", () => {
    const executionDecision: ExecutionDecision = {
      ...standardExecutionDecision,
      eligibleProfile: "light",
      taskKind: "rewrite",
      contextDependency: "none",
      source: "rule",
    };
    const shadowLight = plan({
      executionDecision,
      plannedExecution: buildPlannedExecution({
        decision: executionDecision,
        fastPathEnabled: false,
      }),
    });

    expect(shadowLight.execution.plannedProfile).toBe("standard");
    expect(shadowLight.promptProfile).toBe("compact");
  });

  it("treats brevity as output policy rather than compact eligibility", () => {
    const result = plan({
      userMessage: "La storia la voglio più breve",
    });

    expect(result.responseLength).toBe("brief");
    expect(result.promptProfile).toBe("full");
    expect(result.capabilities.userContext).toBe(true);
  });

  it("does not classify a pre-match bodily reaction as health or safety", () => {
    const result = plan({
      userMessage: "Vomito spesso prima della partita",
    });

    expect(result.promptProfile).toBe("full");
    expect(result.reasonCodes).not.toContain("HEALTH_OR_SAFETY");
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

  it("retains RAG alongside web only for the agentic capability adapter", () => {
    const legacy = plan({
      webSearchEnabled: true,
      classifier: { accepted: true, rag: true },
      allowConcurrentRagAndWeb: false,
    });
    const agentic = plan({
      webSearchEnabled: true,
      classifier: { accepted: true, rag: true },
      allowConcurrentRagAndWeb: true,
    });

    expect(legacy.capabilities).toMatchObject({ webSearch: true, rag: false });
    expect(agentic.capabilities).toMatchObject({ webSearch: true, rag: true });
  });

  it("projects every agentic capability without excluding RAG from web research", () => {
    const result = plan({
      userMessage: "Cerca online fonti e confrontale con i documenti caricati",
      webSearchEnabled: true,
      webFetchEnabled: true,
      allowConcurrentRagAndWeb: true,
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
      userContext: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      routineProposal: false,
      voiceOutput: false,
    });
  });

  it("keeps normalized agentic capabilities when legacy turn planning is enabled", () => {
    const result = planLegacyTurn({
      userMessage: "Motivami",
      isGuest: false,
      isFirstTurn: false,
      inputOrigin: "text",
      outputMode: "text",
      webSearchEnabled: true,
      webFetchEnabled: true,
      allowConcurrentRagAndWeb: true,
      capabilityDecision: {
        webSearch: true,
        webFetch: true,
        rag: true,
        userContext: false,
        memoryRead: false,
        memoryWrite: false,
        memoryDelete: false,
        routineProposal: true,
        voiceOutput: false,
      },
      fullMaxRawTurns: 10,
    });

    expect(result.capabilities).toMatchObject({
      webSearch: true,
      webFetch: true,
      rag: true,
      routineProposal: true,
    });
  });

  it("projects memory writes and overwrites as one capability", () => {
    const create = plan({
      userMessage: "Ricordati che il mio obiettivo è correre 5 km",
    });
    const overwrite = plan({
      userMessage: "Ricordati che il mio obiettivo ora è correre 10 km",
    });

    expect(create.capabilities.memoryWrite).toBe(true);
    expect(overwrite.capabilities.memoryWrite).toBe(true);
    expect(overwrite.capabilities).toMatchObject({
      memoryDelete: false,
      routineProposal: false,
      voiceOutput: false,
    });
  });

  it("projects an exact requested memory deletion without enabling adjacent persistence", () => {
    const result = plan({
      userMessage: "Dimentica questa informazione",
      memoryDeleteEnabled: true,
      memoryDeleteTarget: "training_goal",
    });

    expect(result.capabilities).toMatchObject({
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: true,
      routineProposal: false,
      voiceOutput: false,
    });
  });

  it("projects routine proposals independently from memory and web", () => {
    const result = plan({
      userMessage:
        "Prima della gara perdo lucidità dopo un errore. Dammi una routine pratica di 60 secondi.",
    });

    expect(result.capabilities).toMatchObject({
      webSearch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      routineProposal: true,
      voiceOutput: false,
    });
  });

  it("does not plan a routine proposal when the feature flag is disabled", () => {
    const result = plan({
      userMessage:
        "Prima della gara perdo lucidità dopo un errore. Dammi una routine pratica di 60 secondi.",
      routineProposalAllowed: false,
    });

    expect(result.capabilities.routineProposal).toBe(false);
  });

  it("keeps guest and compact turns non-persistent while allowing guest routines", () => {
    const guestRoutine = plan({
      isGuest: true,
      userMessage:
        "Prima della gara perdo lucidità dopo un errore. Dammi una routine pratica di 60 secondi.",
    });
    const compact = plan({
      userMessage: "Motivami",
      classifier: {
        accepted: true,
        memoryWrite: true,
        memoryDelete: true,
      },
    });

    expect(guestRoutine.capabilities).toMatchObject({
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      routineProposal: true,
    });
    expect(compact.promptProfile).toBe("compact");
    expect(compact.capabilities).toMatchObject({
      memoryWrite: false,
      memoryDelete: false,
      voiceOutput: false,
    });
  });

  it.each([
    ["normal", planTurn],
    ["legacy", planLegacyTurn],
  ] as const)(
    "does not enable deletion without an exact key in %s planning",
    (_, planner) => {
      const baseInput = {
        userMessage: "Dimentica quella informazione",
        isGuest: false,
        isFirstTurn: false,
        inputOrigin: "text" as const,
        outputMode: "text" as const,
        webSearchEnabled: false,
        webFetchEnabled: false,
        fullMaxRawTurns: 10,
      };

      expect(planner(baseInput).capabilities.memoryDelete).toBe(false);
      expect(
        planner({
          ...baseInput,
          memoryDeleteEnabled: true,
          memoryDeleteTarget: "*",
        }).capabilities.memoryDelete,
      ).toBe(false);
      expect(
        planner({
          ...baseInput,
          memoryDeleteEnabled: true,
          memoryDeleteTarget: "training_goal",
        }).capabilities.memoryDelete,
      ).toBe(true);
    },
  );

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
    expect(result.capabilities.rag).toBe(false);
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
    expect(voiceOutput.capabilities.voiceOutput).toBe(true);
    expect(voiceOutput.outputMode).toBe("voice");
    expect(explicitVoiceRequest.promptProfile).toBe("full");
  });
});
