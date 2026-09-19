import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyQStashAuth: vi.fn(),
  processThreadSummaryJob: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/qstash", () => ({ verifyQStashAuth: mocks.verifyQStashAuth }));
vi.mock("@/lib/ai/thread-context", () => ({
  processThreadSummaryJob: mocks.processThreadSummaryJob,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.error }),
}));

import { POST } from "./route";

const job = { conversationThreadId: "thread-1", userId: "user-1" };
const request = () =>
  new Request("http://localhost/api/queues/thread-summary", { method: "POST" });
describe("POST /api/queues/thread-summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyQStashAuth.mockResolvedValue(job);
    mocks.processThreadSummaryJob.mockResolvedValue("updated");
  });
  it("requires a valid endpoint-bound QStash signature", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("signature invalid"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.processThreadSummaryJob).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...job, userId: 1 },
    { ...job, continuation: { summaryId: null, version: -1 } },
    {
      ...job,
      continuation: { summaryId: null, version: 0, pendingUserId: "message-1" },
    },
    {
      ...job,
      continuation: {
        summaryId: null,
        version: 0,
        after: { id: "message-1", createdAt: "invalid" },
      },
    },
  ])("rejects malformed jobs before dispatch (%j)", async (payload) => {
    mocks.verifyQStashAuth.mockResolvedValue(payload);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.processThreadSummaryJob).not.toHaveBeenCalled();
  });
  it("acknowledges one bounded delivery without exposing summary text", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, result: "updated" });
    expect(mocks.processThreadSummaryJob).toHaveBeenCalledWith(job);
  });
  it("requests retry on failure and logs no provider content", async () => {
    mocks.processThreadSummaryJob.mockRejectedValue(new Error("private text"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { conversationThreadId: "thread-1", errorName: "Error" },
    );
  });
});
