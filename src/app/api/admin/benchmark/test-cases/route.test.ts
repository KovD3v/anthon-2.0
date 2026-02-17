import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindFirst: vi.fn(),
  benchmarkTestCaseFindUnique: vi.fn(),
  benchmarkTestCaseFindMany: vi.fn(),
  benchmarkTestCaseCreate: vi.fn(),
  benchmarkTestCaseUpdate: vi.fn(),
  benchmarkTestCaseDelete: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: mocks.userFindFirst,
    },
    benchmarkTestCase: {
      findUnique: mocks.benchmarkTestCaseFindUnique,
      findMany: mocks.benchmarkTestCaseFindMany,
      create: mocks.benchmarkTestCaseCreate,
      update: mocks.benchmarkTestCaseUpdate,
      delete: mocks.benchmarkTestCaseDelete,
    },
  },
}));

import { DELETE, GET, POST } from "./route";

function buildJsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/admin/benchmark/test-cases", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/admin/benchmark/test-cases", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindFirst.mockReset();
    mocks.benchmarkTestCaseFindUnique.mockReset();
    mocks.benchmarkTestCaseFindMany.mockReset();
    mocks.benchmarkTestCaseCreate.mockReset();
    mocks.benchmarkTestCaseUpdate.mockReset();
    mocks.benchmarkTestCaseDelete.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.userFindFirst.mockResolvedValue({ role: "ADMIN" });
    mocks.benchmarkTestCaseFindUnique.mockResolvedValue({ id: "tc-1", name: "Case One" });
    mocks.benchmarkTestCaseFindMany.mockResolvedValue([{ id: "tc-2" }]);
    mocks.benchmarkTestCaseCreate.mockResolvedValue({ id: "tc-new", category: "TOOL_USAGE" });
    mocks.benchmarkTestCaseUpdate.mockResolvedValue({ id: "tc-1", category: "WRITING_QUALITY" });
    mocks.benchmarkTestCaseDelete.mockResolvedValue({ id: "tc-1" });
  });

  it("GET returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/test-cases") as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns 403 for non-admin", async () => {
    mocks.userFindFirst.mockResolvedValue({ role: "USER" });

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/test-cases") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("GET returns 404 when requested case does not exist", async () => {
    mocks.benchmarkTestCaseFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/test-cases?id=missing") as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Test case not found",
    });
  });

  it("GET returns single case by id", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/test-cases?id=tc-1") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      testCase: { id: "tc-1", name: "Case One" },
    });
  });

  it("GET returns filtered list", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/benchmark/test-cases?category=tool_usage&activeOnly=true",
      ) as never,
    );

    expect(mocks.benchmarkTestCaseFindMany).toHaveBeenCalledWith({
      where: {
        category: "TOOL_USAGE",
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ testCases: [{ id: "tc-2" }] });
  });

  it("POST creates test case with normalized payload", async () => {
    const response = await POST(
      buildJsonRequest("POST", {
        category: "tool_usage",
        externalId: "ext-1",
        name: "New Case",
        description: "desc",
        setup: "setup",
        userMessage: "message",
        expectedBehavior: "expected",
      }) as never,
    );

    expect(mocks.benchmarkTestCaseCreate).toHaveBeenCalledWith({
      data: {
        externalId: "ext-1",
        category: "TOOL_USAGE",
        name: "New Case",
        description: "desc",
        setup: "setup",
        userMessage: "message",
        expectedBehavior: "expected",
        isActive: true,
        tags: [],
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      testCase: { id: "tc-new", category: "TOOL_USAGE" },
    });
  });

  it("POST updates when id is provided", async () => {
    const response = await POST(
      buildJsonRequest("POST", {
        id: "tc-1",
        category: "writing_quality",
        externalId: "ext-1",
        name: "Case",
        description: "desc",
        setup: "setup",
        userMessage: "msg",
        expectedBehavior: "expected",
        isActive: false,
        tags: ["adversarial"],
      }) as never,
    );

    expect(mocks.benchmarkTestCaseUpdate).toHaveBeenCalledWith({
      where: { id: "tc-1" },
      data: {
        externalId: "ext-1",
        category: "WRITING_QUALITY",
        name: "Case",
        description: "desc",
        setup: "setup",
        userMessage: "msg",
        expectedBehavior: "expected",
        isActive: false,
        tags: ["adversarial"],
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      testCase: { id: "tc-1", category: "WRITING_QUALITY" },
    });
  });

  it("DELETE validates required id", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/benchmark/test-cases", {
        method: "DELETE",
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "ID is required" });
  });

  it("DELETE removes test case", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/benchmark/test-cases?id=tc-1", {
        method: "DELETE",
      }) as never,
    );

    expect(mocks.benchmarkTestCaseDelete).toHaveBeenCalledWith({
      where: { id: "tc-1" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.benchmarkTestCaseFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/test-cases") as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
