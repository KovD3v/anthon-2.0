import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  benchmarkRunCreate: vi.fn(),
  benchmarkRunUpdate: vi.fn(),
  benchmarkRunDelete: vi.fn(),
  benchmarkResultFindUnique: vi.fn(),
  benchmarkResultUpdate: vi.fn(),
  getBenchmarkRun: vi.fn(),
  listBenchmarkRuns: vi.fn(),
  getModelScores: vi.fn(),
  runBenchmarkForExistingRun: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    benchmarkRun: {
      create: mocks.benchmarkRunCreate,
      update: mocks.benchmarkRunUpdate,
      delete: mocks.benchmarkRunDelete,
    },
    benchmarkResult: {
      findUnique: mocks.benchmarkResultFindUnique,
      update: mocks.benchmarkResultUpdate,
    },
  },
}));

vi.mock("@/lib/benchmark", () => ({
  getBenchmarkRun: mocks.getBenchmarkRun,
  listBenchmarkRuns: mocks.listBenchmarkRuns,
  getModelScores: mocks.getModelScores,
  runBenchmarkForExistingRun: mocks.runBenchmarkForExistingRun,
}));

import { DELETE, GET, PATCH, POST } from "./route";

function buildJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/admin/benchmark", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.benchmarkRunCreate.mockReset();
    mocks.benchmarkRunUpdate.mockReset();
    mocks.benchmarkRunDelete.mockReset();
    mocks.benchmarkResultFindUnique.mockReset();
    mocks.benchmarkResultUpdate.mockReset();
    mocks.getBenchmarkRun.mockReset();
    mocks.listBenchmarkRuns.mockReset();
    mocks.getModelScores.mockReset();
    mocks.runBenchmarkForExistingRun.mockReset();

    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      errorResponse: null,
    });

    mocks.getBenchmarkRun.mockResolvedValue({ id: "run-1", status: "DONE" });
    mocks.listBenchmarkRuns.mockResolvedValue([{ id: "run-1" }]);
    mocks.getModelScores.mockResolvedValue([{ model: "gpt-4", score: 8.5 }]);
    mocks.benchmarkRunCreate.mockResolvedValue({ id: "run-new" });
    mocks.benchmarkRunUpdate.mockResolvedValue({ id: "run-1", status: "DONE" });
    mocks.benchmarkRunDelete.mockResolvedValue({ id: "run-1" });
    mocks.benchmarkResultFindUnique.mockResolvedValue({ overallScore: 7.5 });
    mocks.benchmarkResultUpdate.mockResolvedValue({
      id: "result-1",
      adminScore: 9,
      finalScore: 8.4,
    });
    mocks.runBenchmarkForExistingRun.mockResolvedValue(undefined);
  });

  it("GET returns error when requireAdmin fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark") as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns 403 for non-admin", async () => {
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("GET returns benchmark run details with scores", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark?runId=run-1") as never,
    );

    expect(mocks.getBenchmarkRun).toHaveBeenCalledWith("run-1");
    expect(mocks.getModelScores).toHaveBeenCalledWith("run-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      run: { id: "run-1", status: "DONE" },
      modelScores: [{ model: "gpt-4", score: 8.5 }],
    });
  });

  it("GET returns 404 when runId is not found", async () => {
    mocks.getBenchmarkRun.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark?runId=missing") as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Benchmark run not found",
    });
  });

  it("GET returns list of runs", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark?limit=5") as never,
    );

    expect(mocks.listBenchmarkRuns).toHaveBeenCalledWith(5);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ runs: [{ id: "run-1" }] });
  });

  it("GET returns 400 for invalid limit", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark?limit=oops") as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "limit must be a positive integer",
    });
    expect(mocks.listBenchmarkRuns).not.toHaveBeenCalled();
  });

  it("POST creates run and starts background job", async () => {
    const response = await POST(
      buildJsonRequest("http://localhost/api/admin/benchmark", "POST", {
        name: "My Run",
        description: "desc",
        models: ["model-a"],
        testCaseIds: ["tc-1"],
        categories: ["tool_usage"],
      }) as never,
    );

    expect(mocks.benchmarkRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "My Run",
          description: "desc",
          models: ["model-a"],
          status: "PENDING",
        }),
      }),
    );
    expect(mocks.runBenchmarkForExistingRun).toHaveBeenCalledWith(
      "run-new",
      expect.objectContaining({
        models: ["model-a"],
        testCaseIds: ["tc-1"],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      runId: "run-new",
      message: "Benchmark started",
    });
  });

  it("PATCH validates adminScore bounds for result review", async () => {
    const response = await PATCH(
      buildJsonRequest("http://localhost/api/admin/benchmark", "PATCH", {
        resultId: "result-1",
        adminScore: 99,
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "adminScore must be a number between 0 and 10",
    });
  });

  it("PATCH returns 404 when result is missing", async () => {
    mocks.benchmarkResultFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      buildJsonRequest("http://localhost/api/admin/benchmark", "PATCH", {
        resultId: "missing-result",
        adminScore: 8,
      }) as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Result not found" });
  });

  it("PATCH updates result scoring with weighted final score", async () => {
    const response = await PATCH(
      buildJsonRequest("http://localhost/api/admin/benchmark", "PATCH", {
        resultId: "result-1",
        adminScore: 9,
        adminReasoning: "manual review",
      }) as never,
    );

    expect(mocks.benchmarkResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "result-1" },
        data: expect.objectContaining({
          adminScore: 9,
          adminReasoning: "manual review",
          adminReviewedBy: "admin-1",
          adminReviewedAt: expect.any(Date),
          finalScore: expect.closeTo(8.4, 6),
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      result: {
        id: "result-1",
        adminScore: 9,
        finalScore: 8.4,
      },
    });
  });

  it("PATCH cancels run when action=cancel", async () => {
    mocks.benchmarkRunUpdate.mockResolvedValue({ id: "run-1", status: "CANCELLED" });

    const response = await PATCH(
      buildJsonRequest("http://localhost/api/admin/benchmark", "PATCH", {
        runId: "run-1",
        action: "cancel",
      }) as never,
    );

    expect(mocks.benchmarkRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      run: { id: "run-1", status: "CANCELLED" },
    });
  });

  it("DELETE validates required runId", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/benchmark", {
        method: "DELETE",
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "runId is required" });
  });

  it("DELETE removes benchmark run", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/benchmark?runId=run-1", {
        method: "DELETE",
      }) as never,
    );

    expect(mocks.benchmarkRunDelete).toHaveBeenCalledWith({ where: { id: "run-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Benchmark run deleted",
    });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.listBenchmarkRuns.mockRejectedValue(new Error("db down"));

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark") as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
