import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deterministicMemoryGate,
  shouldExtractMemory,
} from "./memory-candidate-gate";
import { requestTypedDecision } from "./typed-decisions";

vi.mock("./typed-decisions", () => ({
  JEV_MODEL_ID: "typesafe/jev-1.13",
  requestTypedDecision: vi.fn(),
}));
vi.mock("./usage-meter", () => ({ scheduleTypedDecisionUsage: vi.fn() }));

describe("conservative memory candidate gate", () => {
  beforeEach(() => {
    vi.stubEnv("AI_MEMORY_GATE_MODE", "active");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "",
    "   ",
    "Ok, grazie!",
    "Thank you.",
    "👍",
    "grazie mille a presto",
  ])(
    "skips clear empty acknowledgments without a provider: %s",
    async (userText) => {
      expect(await shouldExtractMemory({ userId: "user-1", userText })).toBe(
        false,
      );
      expect(requestTypedDecision).not.toHaveBeenCalled();
    },
  );

  it.each([
    "Ricorda: tennis",
    "Correzione: 17",
    "Non più calcio",
    "Actually, Tuesday",
    "Dimentica il mio numero",
    "17",
    "No",
    "Yes",
  ])(
    "preserves explicit requests and short contextual corrections: %s",
    async (userText) => {
      expect(await shouldExtractMemory({ userId: "user-1", userText })).toBe(
        true,
      );
      expect(requestTypedDecision).not.toHaveBeenCalled();
    },
  );

  it("retains acknowledgments when the assistant refers to saving or confirming memory", () => {
    expect(
      deterministicMemoryGate({
        userText: "Ok",
        assistantText: "Vuoi confermare il salvataggio?",
      }),
    ).toBe(true);
    expect(
      deterministicMemoryGate({ userText: "Ok, ho iniziato il tennis" }),
    ).toBeNull();
    expect(
      deterministicMemoryGate({
        userText: "Grazie mille, a presto. Ho un esame domani.",
      }),
    ).toBeNull();
  });

  it.each([
    [{ ok: true, choice: "candidate", confidence: 1 }, true],
    [{ ok: true, choice: "uncertain", confidence: 1 }, true],
    [{ ok: true, choice: "no_memory", confidence: 0.97 }, true],
    [{ ok: true, choice: "no_memory", confidence: 0.99 }, false],
    [{ ok: false, failureCode: "timeout" }, true],
  ] as const)(
    "keeps uncertainty and errors eligible for extraction",
    async (decision, expected) => {
      vi.mocked(requestTypedDecision).mockResolvedValue({
        ...decision,
        modelId: "typesafe/jev-1.13",
        attempted: true,
        durationMs: 10,
      });
      expect(
        await shouldExtractMemory({
          userId: "user-1",
          userText: "Questo cambia la situazione",
        }),
      ).toBe(expected);
    },
  );

  it("supports immediate rollback and shadow observation", async () => {
    vi.stubEnv("AI_MEMORY_GATE_MODE", "off");
    expect(
      await shouldExtractMemory({
        userId: "user-1",
        userText: "Questo cambia la situazione",
      }),
    ).toBe(true);
    expect(requestTypedDecision).not.toHaveBeenCalled();
    expect(
      await shouldExtractMemory({
        userId: "user-1",
        userText: "grazie mille a presto",
      }),
    ).toBe(true);
    vi.stubEnv("AI_MEMORY_GATE_MODE", "shadow");
    vi.mocked(requestTypedDecision).mockResolvedValue({
      ok: true,
      choice: "no_memory",
      confidence: 1,
      modelId: "typesafe/jev-1.13",
      attempted: true,
      durationMs: 10,
    });
    expect(
      await shouldExtractMemory({
        userId: "user-1",
        userText: "Questo cambia la situazione",
      }),
    ).toBe(true);
  });

  it("uses conservative active selection by default", async () => {
    delete process.env.AI_MEMORY_GATE_MODE;
    vi.mocked(requestTypedDecision).mockResolvedValue({
      ok: true,
      choice: "no_memory",
      confidence: 0.99,
      modelId: "typesafe/jev-1.13",
      attempted: true,
      durationMs: 10,
    });
    expect(
      await shouldExtractMemory({
        userId: "user-1",
        userText: "Qual è la capitale del Canada?",
      }),
    ).toBe(false);
  });
});
