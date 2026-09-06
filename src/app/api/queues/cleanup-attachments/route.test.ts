import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyQStashAuth: vi.fn(),
  runAttachmentCleanup: vi.fn(),
  enqueueAttachmentCleanupContinuation: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

vi.mock("@/lib/maintenance/attachment-cleanup", () => ({
  runAttachmentCleanup: mocks.runAttachmentCleanup,
  enqueueAttachmentCleanupContinuation:
    mocks.enqueueAttachmentCleanupContinuation,
}));

import { POST } from "./route";

describe("/api/queues/cleanup-attachments", () => {
  beforeEach(() => {
    mocks.verifyQStashAuth.mockReset();
    mocks.runAttachmentCleanup.mockReset();
    mocks.enqueueAttachmentCleanupContinuation.mockReset();
    mocks.enqueueAttachmentCleanupContinuation.mockResolvedValue(undefined);
    mocks.runAttachmentCleanup.mockResolvedValue({
      stats: {
        scannedUsers: 1,
        processedUsers: 1,
        scannedAttachments: 1,
        deletedAttachments: 1,
        deletedBlobs: 1,
        missingBlobs: 0,
        errors: 0,
      },
      pagination: {
        hasMore: false,
        nextCursor: null,
        resumeCurrentUser: false,
      },
    });
  });

  it("rejects invalid QStash signatures", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("bad signature"));

    const response = await POST(
      new Request("http://localhost/api/queues/cleanup-attachments", {
        method: "POST",
        body: JSON.stringify({ cursor: "user-1" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.runAttachmentCleanup).not.toHaveBeenCalled();
  });

  it("validates the signed continuation payload", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({
      cursor: 42,
      resumeCurrentUser: true,
    });

    const response = await POST(
      new Request("http://localhost/api/queues/cleanup-attachments", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.runAttachmentCleanup).not.toHaveBeenCalled();
  });

  it("runs the bounded page and schedules its next cursor", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({
      cursor: "user-1",
      resumeCurrentUser: true,
      attachmentCursor: "att-20",
    });
    const result = {
      stats: { scannedUsers: 2 },
      pagination: {
        hasMore: true,
        nextCursor: "user-2",
        resumeCurrentUser: false,
      },
    };
    mocks.runAttachmentCleanup.mockResolvedValue(result);

    const response = await POST(
      new Request("http://localhost/api/queues/cleanup-attachments", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runAttachmentCleanup).toHaveBeenCalledWith({
      cursor: "user-1",
      resumeCurrentUser: true,
      attachmentCursor: "att-20",
    });
    expect(mocks.enqueueAttachmentCleanupContinuation).toHaveBeenCalledWith(
      result.pagination,
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      ...result,
    });
  });
});
