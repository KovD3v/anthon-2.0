import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  benchmarkRunCreate: vi.fn(),
  benchmarkRunFindUnique: vi.fn(),
  benchmarkRunUpdate: vi.fn(),
  benchmarkResultCreate: vi.fn(),
  benchmarkResultFindMany: vi.fn(),
  benchmarkTestCaseFindMany: vi.fn(),
  evaluateResultWithConsensus: vi.fn(),
  openrouter: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    benchmarkRun: {
      create: mocks.benchmarkRunCreate,
      findUnique: mocks.benchmarkRunFindUnique,
      update: mocks.benchmarkRunUpdate,
    },
    benchmarkResult: {
      create: mocks.benchmarkResultCreate,
      findMany: mocks.benchmarkResultFindMany,
    },
    benchmarkTestCase: {
      findMany: mocks.benchmarkTestCaseFindMany,
    },
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));

vi.mock("./judge", () => ({
  evaluateResultWithConsensus: mocks.evaluateResultWithConsensus,
}));

import { runBenchmarkForExistingRun } from "./runner";

const existingRun = {
  id: "run-1",
  name: "Run",
  description: null,
  models: ["model-a"],
  status: "PENDING",
  startedAt: null,
  endedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  approved: null,
  totalTests: 0,
  completedTests: 0,
  currentProgress: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("benchmark runner", () => {
  beforeEach(() => {
    mocks.benchmarkRunCreate.mockReset();
    mocks.benchmarkRunFindUnique.mockReset();
    mocks.benchmarkRunUpdate.mockReset();
    mocks.benchmarkResultCreate.mockReset();
    mocks.benchmarkResultFindMany.mockReset();
    mocks.benchmarkTestCaseFindMany.mockReset();
    mocks.evaluateResultWithConsensus.mockReset();
    mocks.openrouter.mockReset();

    mocks.benchmarkRunFindUnique.mockResolvedValue(existingRun);
    mocks.benchmarkRunUpdate.mockResolvedValue(existingRun);
    mocks.benchmarkResultFindMany.mockResolvedValue([]);
    mocks.benchmarkTestCaseFindMany.mockResolvedValue([]);
  });

  it("matches selected test cases by database id or external id", async () => {
    await runBenchmarkForExistingRun("run-1", {
      testCaseIds: ["db-case-1", "external-case-1"],
    });

    expect(mocks.benchmarkTestCaseFindMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { id: { in: ["db-case-1", "external-case-1"] } },
          { externalId: { in: ["db-case-1", "external-case-1"] } },
        ],
      },
    });
  });

  it("does not overwrite a cancelled run as completed", async () => {
    mocks.benchmarkRunFindUnique
      .mockResolvedValueOnce(existingRun)
      .mockResolvedValueOnce({ status: "CANCELLED" })
      .mockResolvedValueOnce({ status: "CANCELLED" });
    mocks.benchmarkTestCaseFindMany.mockResolvedValue([
      {
        id: "tc-1",
        externalId: null,
        category: "TOOL_USAGE",
        name: "Case",
        description: null,
        setup: { session: [], memories: [], userContext: {} },
        userMessage: "Ciao sono Marco",
        expectedBehavior: { shouldUseTool: true },
        tags: [],
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await runBenchmarkForExistingRun("run-1", { models: ["model-a"] });

    expect(mocks.benchmarkRunUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("ranks models by composite benchmark score instead of raw quality alone", async () => {
    const { getModelScores } = await import("./runner");

    mocks.benchmarkResultFindMany.mockResolvedValue([
      {
        modelId: "quality-only",
        finalScore: null,
        consensusScore: 8.5,
        overallScore: 8.5,
        judge2OverallScore: 8.5,
        flaggedForReview: false,
        inferenceTimeMs: 60_000,
        ttftMs: 50_000,
        costUsd: 0.1,
        inputTokens: 1000,
        outputTokens: 400,
        reasoningTokens: null,
        toolUsageScore: 8.5,
        writingQualityScore: null,
      },
      {
        modelId: "balanced",
        finalScore: null,
        consensusScore: 8,
        overallScore: 8,
        judge2OverallScore: 8,
        flaggedForReview: false,
        inferenceTimeMs: 1_000,
        ttftMs: 500,
        costUsd: 0.001,
        inputTokens: 1000,
        outputTokens: 300,
        reasoningTokens: null,
        toolUsageScore: 8,
        writingQualityScore: null,
      },
    ]);

    const scores = await getModelScores("run-1");

    expect(scores[0]?.modelId).toBe("balanced");
    expect(scores[0]?.benchmarkScore).toBeGreaterThan(
      scores[1]?.benchmarkScore ?? 0,
    );
    expect(scores[1]?.avgOverallScore).toBeGreaterThan(
      scores[0]?.avgOverallScore ?? 0,
    );
  });
});
