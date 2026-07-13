import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyQStashAuth: vi.fn(),
  processVoiceGenerationJob: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

vi.mock("@/lib/voice/generation-jobs", () => ({
  processVoiceGenerationJob: mocks.processVoiceGenerationJob,
}));

import { POST } from "./route";

describe("POST /api/queues/voice", () => {
  beforeEach(() => {
    mocks.verifyQStashAuth.mockReset();
    mocks.processVoiceGenerationJob.mockReset();
    mocks.verifyQStashAuth.mockResolvedValue({ messageId: "message-1" });
    mocks.processVoiceGenerationJob.mockResolvedValue("ready");
  });

  it("rejects requests without a valid QStash signature", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("bad signature"));

    const response = await POST(
      new Request("http://localhost/api/queues/voice", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(mocks.processVoiceGenerationJob).not.toHaveBeenCalled();
  });

  it("rejects malformed queue payloads", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({});

    const response = await POST(
      new Request("http://localhost/api/queues/voice", { method: "POST" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.processVoiceGenerationJob).not.toHaveBeenCalled();
  });

  it("asks QStash to retry transient job failures", async () => {
    mocks.processVoiceGenerationJob.mockResolvedValue("retry");

    const response = await POST(
      new Request("http://localhost/api/queues/voice", { method: "POST" }),
    );

    expect(response.status).toBe(503);
    expect(mocks.processVoiceGenerationJob).toHaveBeenCalledWith("message-1");
  });

  it("acknowledges a completed job", async () => {
    const response = await POST(
      new Request("http://localhost/api/queues/voice", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      result: "ready",
    });
  });

  it("acknowledges a deferred duplicate after it schedules lease recovery", async () => {
    mocks.processVoiceGenerationJob.mockResolvedValue("deferred");

    const response = await POST(
      new Request("http://localhost/api/queues/voice", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      result: "deferred",
    });
  });
});
