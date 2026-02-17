import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindFirst: vi.fn(),
  benchmarkTestCaseUpdate: vi.fn(),
  benchmarkTestCaseDelete: vi.fn(),
  generateAdversarialCases: vi.fn(),
  getPendingAdversarialCases: vi.fn(),
  saveAdversarialCase: vi.fn(),
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
      update: mocks.benchmarkTestCaseUpdate,
      delete: mocks.benchmarkTestCaseDelete,
    },
  },
}));

vi.mock("@/lib/benchmark", () => ({
  generateAdversarialCases: mocks.generateAdversarialCases,
  getPendingAdversarialCases: mocks.getPendingAdversarialCases,
  saveAdversarialCase: mocks.saveAdversarialCase,
}));

import { GET, PATCH, POST } from "./route";

function buildJsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/admin/benchmark/adversarial", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/admin/benchmark/adversarial", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindFirst.mockReset();
    mocks.benchmarkTestCaseUpdate.mockReset();
    mocks.benchmarkTestCaseDelete.mockReset();
    mocks.generateAdversarialCases.mockReset();
    mocks.getPendingAdversarialCases.mockReset();
    mocks.saveAdversarialCase.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.userFindFirst.mockResolvedValue({ role: "ADMIN" });
    mocks.generateAdversarialCases.mockResolvedValue([
      { name: "case-1" },
      { name: "case-2" },
    ]);
    mocks.saveAdversarialCase
      .mockResolvedValueOnce("tc-1")
      .mockResolvedValueOnce("tc-2");
    mocks.getPendingAdversarialCases.mockResolvedValue([{ id: "pending-1" }]);
    mocks.benchmarkTestCaseUpdate.mockResolvedValue({ id: "tc-1", isActive: true });
    mocks.benchmarkTestCaseDelete.mockResolvedValue({ id: "tc-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(buildJsonRequest("POST", {} as object) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when non-admin", async () => {
    mocks.userFindFirst.mockResolvedValue({ role: "USER" });

    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/adversarial") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("POST generates adversarial cases and autosaves when requested", async () => {
    const response = await POST(
      buildJsonRequest("POST", {
        count: 50,
        categories: ["tool_usage"],
        focusOnLowScores: true,
        autoSave: true,
      }) as never,
    );

    expect(mocks.generateAdversarialCases).toHaveBeenCalledWith({
      count: 10,
      categories: ["tool_usage"],
      focusOnLowScores: true,
    });
    expect(mocks.saveAdversarialCase).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      count: 2,
      cases: [{ name: "case-1" }, { name: "case-2" }],
      savedIds: ["tc-1", "tc-2"],
    });
  });

  it("GET returns pending adversarial cases", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/benchmark/adversarial") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      count: 1,
      cases: [{ id: "pending-1" }],
    });
  });

  it("PATCH validates required fields", async () => {
    const response = await PATCH(
      buildJsonRequest("PATCH", { testCaseId: "" }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "testCaseId and action are required",
    });
  });

  it("PATCH approves test case", async () => {
    const response = await PATCH(
      buildJsonRequest("PATCH", {
        testCaseId: "tc-1",
        action: "approve",
      }) as never,
    );

    expect(mocks.benchmarkTestCaseUpdate).toHaveBeenCalledWith({
      where: { id: "tc-1" },
      data: { isActive: true },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      action: "approve",
      testCaseId: "tc-1",
    });
  });

  it("PATCH rejects test case", async () => {
    const response = await PATCH(
      buildJsonRequest("PATCH", {
        testCaseId: "tc-1",
        action: "reject",
      }) as never,
    );

    expect(mocks.benchmarkTestCaseDelete).toHaveBeenCalledWith({
      where: { id: "tc-1" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      action: "reject",
      testCaseId: "tc-1",
    });
  });

  it("PATCH validates action values", async () => {
    const response = await PATCH(
      buildJsonRequest("PATCH", {
        testCaseId: "tc-1",
        action: "archive",
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "action must be 'approve' or 'reject'",
    });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.generateAdversarialCases.mockRejectedValue(new Error("model failed"));

    const response = await POST(
      buildJsonRequest("POST", { count: 2 }) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "model failed" });
  });
});
