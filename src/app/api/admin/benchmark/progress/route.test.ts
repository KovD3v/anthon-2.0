import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  benchmarkRunFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    benchmarkRun: {
      findUnique: mocks.benchmarkRunFindUnique,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/benchmark/progress", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.benchmarkRunFindUnique.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.benchmarkRunFindUnique.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
      totalTests: 20,
      completedTests: 5,
      currentProgress: "Running case 5/20",
      startedAt: new Date("2026-02-15T12:00:00.000Z"),
      endedAt: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/progress?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({ errorResponse: forbidden });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/progress?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.benchmarkRunFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/progress") as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "runId is required",
    });
  });

  it("returns 404 when run does not exist", async () => {
    mocks.benchmarkRunFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/progress?runId=missing",
      ) as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Run not found" });
  });

  it("returns progress payload", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/progress?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      status: "RUNNING",
      total: 20,
      completed: 5,
      currentProgress: "Running case 5/20",
      progress: 25,
    });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.benchmarkRunFindUnique.mockRejectedValue(new Error("db down"));

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/progress?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
