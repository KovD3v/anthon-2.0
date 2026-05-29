import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  benchmarkRunCreate: vi.fn(),
  benchmarkRunFindUnique: vi.fn(),
  benchmarkRunUpdate: vi.fn(),
  benchmarkResultCreate: vi.fn(),
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
    mocks.benchmarkTestCaseFindMany.mockReset();
    mocks.evaluateResultWithConsensus.mockReset();
    mocks.openrouter.mockReset();

    mocks.benchmarkRunFindUnique.mockResolvedValue(existingRun);
    mocks.benchmarkRunUpdate.mockResolvedValue(existingRun);
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
});
