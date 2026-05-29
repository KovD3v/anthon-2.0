import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  benchmarkResultFindMany: vi.fn(),
  benchmarkTestCaseFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    benchmarkResult: {
      findMany: mocks.benchmarkResultFindMany,
    },
    benchmarkTestCase: {
      findMany: mocks.benchmarkTestCaseFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/benchmark/export", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.benchmarkResultFindMany.mockReset();
    mocks.benchmarkTestCaseFindMany.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.benchmarkResultFindMany.mockResolvedValue([
      {
        testCaseId: "tc-1",
        overallScore: 6,
        consensusScore: 7.5,
        finalScore: null,
        responseText: "Assistant best response",
        run: { id: "run-1" },
      },
    ]);
    mocks.benchmarkTestCaseFindMany.mockResolvedValue([
      {
        id: "tc-1",
        externalId: null,
        setup: {
          session: [{ role: "assistant", content: "Come posso aiutarti?" }],
        },
        userMessage: "Come gestisco l'ansia pre gara?",
      },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/export?runId=run-1",
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
        "http://localhost/api/admin/benchmark/export?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.benchmarkResultFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/export") as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "runId is required",
    });
  });

  it.each(["not-a-number", "7.5abc", "Infinity", "-1", "11"])(
    "returns 400 when minScore is invalid: %s",
    async (minScore) => {
      const response = await GET(
        new Request(
          `http://localhost/api/admin/benchmark/export?runId=run-1&minScore=${minScore}`,
        ) as never,
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "minScore must be a number between 0 and 10",
      });
      expect(mocks.benchmarkResultFindMany).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when no qualifying results are found", async () => {
    mocks.benchmarkResultFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/export?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No results found with the given criteria",
    });
  });

  it("returns JSONL export with attachment headers", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/export?runId=run-1&minScore=7.5",
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/x-jsonlines",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "benchmark-export-run-1.jsonl",
    );

    const text = await response.text();
    const line = JSON.parse(text.split("\n")[0]) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(mocks.benchmarkResultFindMany).toHaveBeenCalledWith({
      where: { runId: "run-1" },
      include: { run: true },
    });
    expect(mocks.benchmarkTestCaseFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: { in: ["tc-1"] } }, { externalId: { in: ["tc-1"] } }],
      },
      select: {
        id: true,
        externalId: true,
        setup: true,
        userMessage: true,
      },
    });
    expect(line.messages).toEqual([
      {
        role: "system",
        content: "Sei Anthon, un coach digitale di performance sportiva.",
      },
      { role: "assistant", content: "Come posso aiutarti?" },
      { role: "user", content: "Come gestisco l'ansia pre gara?" },
      { role: "assistant", content: "Assistant best response" },
    ]);
    expect(line.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Assistant best response",
    });
  });

  it("uses final score then consensus score before judge score for minScore filtering", async () => {
    mocks.benchmarkResultFindMany.mockResolvedValue([
      {
        testCaseId: "tc-low-overall",
        overallScore: 2,
        consensusScore: 4,
        finalScore: 8.2,
        responseText: "Admin approved response",
      },
      {
        testCaseId: "tc-low",
        overallScore: 8.1,
        consensusScore: null,
        finalScore: null,
        responseText: "Judge approved response",
      },
      {
        testCaseId: "tc-rejected",
        overallScore: 2,
        consensusScore: 7.9,
        finalScore: null,
        responseText: "Too low",
      },
    ]);
    mocks.benchmarkTestCaseFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/export?runId=run-1&minScore=8",
      ) as never,
    );

    expect(response.status).toBe(200);
    const lines = (await response.text()).split("\n").map((line) => {
      return JSON.parse(line) as { messages: Array<{ content: string }> };
    });
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.messages.at(-1)?.content)).toEqual([
      "Admin approved response",
      "Judge approved response",
    ]);
  });

  it("returns 500 on unexpected error", async () => {
    mocks.benchmarkResultFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/export?runId=run-1",
      ) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
