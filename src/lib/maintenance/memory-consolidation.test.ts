import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  listActiveFacts: vi.fn(),
  rememberFact: vi.fn(),
  reviseFact: vi.fn(),
  forgetFact: vi.fn(),
  invalidateMemoriesForPromptCache: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  MAINTENANCE_MODEL_ID: "maintenance-model-id",
  maintenanceModel: "maintenance-model",
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  invalidateMemoriesForPromptCache: mocks.invalidateMemoriesForPromptCache,
}));

vi.mock("@/lib/ai/memory-facts", () => ({
  listActiveFacts: mocks.listActiveFacts,
  rememberFact: mocks.rememberFact,
  reviseFact: mocks.reviseFact,
  forgetFact: mocks.forgetFact,
}));

import { consolidateMemories } from "./memory-consolidation";

function buildMemories(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `memory-${index + 1}`,
    key: `detail_${index + 1}`,
    content: `content-${index + 1}`,
    category: "other",
    confidence: 0.8,
    origin: "INFERRED" as const,
    observedAt: new Date("2026-02-17T11:00:00.000Z"),
    updatedAt: new Date("2026-02-17T11:00:00.000Z"),
  }));
}

describe("maintenance/memory-consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outputObject.mockReturnValue({ schema: "mocked-schema" });
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.listActiveFacts.mockResolvedValue({
      degraded: false,
      facts: buildMemories(5),
    });
    mocks.rememberFact.mockResolvedValue({
      status: "saved",
      factId: "memory-new",
    });
    mocks.reviseFact.mockResolvedValue({
      status: "saved",
      factId: "memory-1",
    });
    mocks.forgetFact.mockResolvedValue({ status: "forgotten" });
  });

  it("returns early when fewer than five active facts remain", async () => {
    mocks.listActiveFacts.mockResolvedValue({
      degraded: false,
      facts: buildMemories(4),
    });

    await consolidateMemories("user-1");

    expect(mocks.listActiveFacts).toHaveBeenCalledWith({
      userId: "user-1",
      limit: 64,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("returns without mutations when the model finds no consolidations", async () => {
    mocks.generateText.mockResolvedValue({
      usage: { inputTokens: 40, outputTokens: 5 },
      providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
      output: { memories: [] },
    });

    await consolidateMemories("user-1");

    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "maintenance-model-id",
      usage: { inputTokens: 40, outputTokens: 5 },
      providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
    expect(mocks.forgetFact).not.toHaveBeenCalled();
  });

  it("creates a revisioned consolidated fact before soft-forgetting originals", async () => {
    mocks.generateText.mockResolvedValue({
      usage: { inputTokens: 80, outputTokens: 20 },
      providerMetadata: { openrouter: { usage: { cost: 0.003 } } },
      output: {
        memories: [
          {
            originalKeys: ["detail_1", "detail_2"],
            newKey: "match_preparation",
            newValue: "Routine breve prima della partita",
            category: "other",
            confidence: 0.95,
            reasoning: "Merged duplicates",
          },
        ],
      },
    });

    await consolidateMemories("user-1");

    expect(mocks.rememberFact).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        key: "match_preparation",
        value: "Routine breve prima della partita",
        origin: "INFERRED",
        dedupeKey: expect.stringMatching(/^maintenance:remember:/),
      }),
    );
    expect(mocks.forgetFact).toHaveBeenCalledTimes(2);
    expect(mocks.forgetFact).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: "user-1",
        factId: "memory-1",
        dedupeKey: expect.stringMatching(/^maintenance:forget:/),
      }),
    );
    expect(mocks.invalidateMemoriesForPromptCache).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("revises an existing target and does not forget it", async () => {
    mocks.generateText.mockResolvedValue({
      usage: {},
      providerMetadata: {},
      output: {
        memories: [
          {
            originalKeys: ["detail_1", "detail_2"],
            newKey: "detail_1",
            newValue: "Consolidated",
            category: "other",
            confidence: 0.9,
            reasoning: "Merged duplicates",
          },
        ],
      },
    });

    await consolidateMemories("user-1");

    expect(mocks.reviseFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factId: "memory-1",
        key: "detail_1",
        dedupeKey: expect.stringMatching(/^maintenance:revise:/),
      }),
    );
    expect(mocks.rememberFact).not.toHaveBeenCalled();
    expect(mocks.forgetFact).toHaveBeenCalledTimes(1);
    expect(mocks.forgetFact).toHaveBeenCalledWith(
      expect.objectContaining({ factId: "memory-2" }),
    );
  });

  it("keeps originals when the consolidated fact cannot be persisted", async () => {
    mocks.generateText.mockResolvedValue({
      usage: {},
      providerMetadata: {},
      output: {
        memories: [
          {
            originalKeys: ["detail_1", "detail_2"],
            newKey: "match_preparation",
            newValue: "Routine breve",
            category: "other",
            confidence: 0.9,
            reasoning: "Merged duplicates",
          },
        ],
      },
    });
    mocks.rememberFact.mockResolvedValue({ status: "rejected" });

    await consolidateMemories("user-1");

    expect(mocks.forgetFact).not.toHaveBeenCalled();
  });

  it("fails open when active-fact loading or model analysis fails", async () => {
    mocks.listActiveFacts.mockResolvedValue({ degraded: true, facts: [] });
    await expect(consolidateMemories("user-1")).resolves.toBeUndefined();
    expect(mocks.generateText).not.toHaveBeenCalled();

    mocks.listActiveFacts.mockResolvedValue({
      degraded: false,
      facts: buildMemories(7),
    });
    mocks.generateText.mockRejectedValue(new Error("ai unavailable"));
    await expect(consolidateMemories("user-1")).resolves.toBeUndefined();
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });
});
