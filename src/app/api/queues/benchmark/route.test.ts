import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runBenchmarkForExistingRun: vi.fn(),
  verifyQStashAuth: vi.fn(),
}));

vi.mock("@/lib/benchmark", () => ({
  runBenchmarkForExistingRun: mocks.runBenchmarkForExistingRun,
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

import { POST } from "./route";

describe("POST /api/queues/benchmark", () => {
  beforeEach(() => {
    mocks.runBenchmarkForExistingRun.mockReset();
    mocks.verifyQStashAuth.mockReset();

    mocks.verifyQStashAuth.mockResolvedValue({
      runId: "run-1",
      options: {
        models: ["model-a"],
        testCaseIds: ["tc-1"],
        categories: ["tool_usage"],
        iterations: 2,
        concurrency: 3,
      },
    });
    mocks.runBenchmarkForExistingRun.mockResolvedValue(undefined);
  });

  it("returns 400 when runId is missing", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({});

    const response = await POST({} as Request);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing runId");
    expect(mocks.runBenchmarkForExistingRun).not.toHaveBeenCalled();
  });

  it("runs the benchmark and returns success", async () => {
    const response = await POST({} as Request);

    expect(response.status).toBe(200);
    expect(mocks.runBenchmarkForExistingRun).toHaveBeenCalledWith("run-1", {
      models: ["model-a"],
      testCaseIds: ["tc-1"],
      categories: ["tool_usage"],
      iterations: 2,
      concurrency: 3,
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 400 when auth verification or execution fails", async () => {
    mocks.runBenchmarkForExistingRun.mockRejectedValue(new Error("run failed"));

    const response = await POST({} as Request);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });
});
