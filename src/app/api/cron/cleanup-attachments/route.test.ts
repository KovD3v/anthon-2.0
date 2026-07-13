import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}

  return {
    BlobNotFoundError,
    del: vi.fn(),
    deletePrivateVoiceBlob: vi.fn(),
    isPrivateVoiceBlobUrl: vi.fn(),
    userFindMany: vi.fn(),
    attachmentFindMany: vi.fn(),
    attachmentDelete: vi.fn(),
  };
});

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: mocks.BlobNotFoundError,
  del: mocks.del,
}));
vi.mock("@/lib/voice/storage", () => ({
  deletePrivateVoiceBlob: mocks.deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl: mocks.isPrivateVoiceBlobUrl,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: mocks.userFindMany,
    },
    attachment: {
      findMany: mocks.attachmentFindMany,
      delete: mocks.attachmentDelete,
    },
  },
}));

import { GET, POST } from "./route";

const originalEnv = { ...process.env };
const cleanupConfigKeys = [
  "ATTACHMENT_CLEANUP_USER_BATCH_SIZE",
  "ATTACHMENT_CLEANUP_ATTACHMENT_BATCH_SIZE",
  "ATTACHMENT_CLEANUP_MAX_ATTACHMENTS_PER_RUN",
  "ATTACHMENT_CLEANUP_DELETE_CONCURRENCY",
] as const;

const userSelect = {
  id: true,
  role: true,
  isGuest: true,
  subscription: {
    select: {
      status: true,
      planId: true,
    },
  },
};

function createUser(id: string, isGuest = false) {
  return {
    id,
    role: "USER",
    isGuest,
    subscription: isGuest ? null : { status: "ACTIVE", planId: "my-pro-plan" },
  };
}

function createRequest(path = "") {
  return new Request(`http://localhost/api/cron/cleanup-attachments${path}`, {
    method: "POST",
    headers: { authorization: "Bearer secret-1" },
  });
}

describe("/api/cron/cleanup-attachments", () => {
  beforeEach(() => {
    mocks.del.mockReset();
    mocks.deletePrivateVoiceBlob.mockReset();
    mocks.isPrivateVoiceBlobUrl.mockReset().mockReturnValue(false);
    mocks.userFindMany.mockReset();
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentDelete.mockReset();
    cleanupConfigKeys.forEach((key) => {
      delete process.env[key];
    });

    process.env.CRON_SECRET = "secret-1";

    mocks.userFindMany.mockResolvedValue([
      createUser("user-1"),
      createUser("user-2", true),
    ]);
    mocks.attachmentFindMany
      .mockResolvedValueOnce([
        { id: "att-1", blobUrl: "https://blob.test/1" },
        { id: "att-2", blobUrl: null },
      ])
      .mockResolvedValueOnce([]);
    mocks.del.mockResolvedValue(undefined);
    mocks.attachmentDelete.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-attachments", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("cleans up an ordered, bounded attachment page and reports stats", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      take: 26,
      orderBy: { id: "asc" },
      select: userSelect,
    });
    expect(mocks.attachmentFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        createdAt: {
          lt: expect.any(Date),
        },
        OR: [
          {
            message: {
              userId: "user-1",
            },
          },
          {
            messageId: null,
            blobUrl: {
              contains: "/uploads/user-1/",
            },
          },
          {
            messageId: null,
            blobUrl: {
              contains: "/attachments/user-1/",
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 21,
      select: {
        id: true,
        blobUrl: true,
      },
    });
    expect(mocks.attachmentFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        createdAt: {
          lt: expect.any(Date),
        },
        OR: [
          {
            message: {
              userId: "user-2",
            },
          },
          {
            messageId: null,
            blobUrl: {
              contains: "/uploads/user-2/",
            },
          },
          {
            messageId: null,
            blobUrl: {
              contains: "/attachments/user-2/",
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 21,
      select: {
        id: true,
        blobUrl: true,
      },
    });

    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentDelete).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        scannedUsers: 2,
        processedUsers: 1,
        scannedAttachments: 2,
        deletedAttachments: 2,
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

  it("uses cursor pagination and stops at configured attachment budget", async () => {
    process.env.ATTACHMENT_CLEANUP_USER_BATCH_SIZE = "2";
    process.env.ATTACHMENT_CLEANUP_ATTACHMENT_BATCH_SIZE = "5";
    process.env.ATTACHMENT_CLEANUP_MAX_ATTACHMENTS_PER_RUN = "3";
    mocks.userFindMany.mockResolvedValue([
      createUser("user-1"),
      createUser("user-2"),
      createUser("user-3"),
    ]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-1", blobUrl: "https://blob.test/1" },
      { id: "att-2", blobUrl: "https://blob.test/2" },
      { id: "att-3", blobUrl: "https://blob.test/3" },
    ]);

    const response = await POST(createRequest("?cursor=user-0"));

    expect(mocks.userFindMany).toHaveBeenCalledWith({
      take: 3,
      cursor: { id: "user-0" },
      skip: 1,
      orderBy: { id: "asc" },
      select: userSelect,
    });
    expect(mocks.attachmentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 4,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(mocks.del).toHaveBeenCalledTimes(3);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        scannedUsers: 2,
        processedUsers: 1,
        scannedAttachments: 3,
        deletedAttachments: 3,
        deletedBlobs: 3,
        missingBlobs: 0,
        errors: 0,
      },
      pagination: {
        hasMore: true,
        nextCursor: "user-2",
        resumeCurrentUser: true,
      },
    });
  });

  it("resumes the current user when an attachment page has more work", async () => {
    process.env.ATTACHMENT_CLEANUP_USER_BATCH_SIZE = "1";
    process.env.ATTACHMENT_CLEANUP_ATTACHMENT_BATCH_SIZE = "2";
    process.env.ATTACHMENT_CLEANUP_MAX_ATTACHMENTS_PER_RUN = "2";
    mocks.userFindMany.mockResolvedValue([createUser("user-1")]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-1", blobUrl: "https://blob.test/1" },
      { id: "att-2", blobUrl: "https://blob.test/2" },
      { id: "att-3", blobUrl: "https://blob.test/3" },
    ]);

    const response = await POST(createRequest("?cursor=user-1&resume=true"));

    expect(mocks.userFindMany).toHaveBeenCalledWith({
      take: 2,
      cursor: { id: "user-1" },
      orderBy: { id: "asc" },
      select: userSelect,
    });
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(mocks.del).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      pagination: {
        hasMore: true,
        nextCursor: "user-1",
        resumeCurrentUser: true,
      },
    });
  });

  it("limits independent Blob deletes to the configured concurrency", async () => {
    process.env.ATTACHMENT_CLEANUP_USER_BATCH_SIZE = "1";
    process.env.ATTACHMENT_CLEANUP_ATTACHMENT_BATCH_SIZE = "5";
    process.env.ATTACHMENT_CLEANUP_MAX_ATTACHMENTS_PER_RUN = "5";
    process.env.ATTACHMENT_CLEANUP_DELETE_CONCURRENCY = "2";
    mocks.userFindMany.mockResolvedValue([createUser("user-1")]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `att-${index + 1}`,
        blobUrl: `https://blob.test/${index + 1}`,
      })),
    );

    let activeDeletes = 0;
    let maxActiveDeletes = 0;
    mocks.del.mockImplementation(async () => {
      activeDeletes += 1;
      maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeDeletes -= 1;
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.del).toHaveBeenCalledTimes(5);
    expect(maxActiveDeletes).toBe(2);
    expect(mocks.attachmentDelete).toHaveBeenCalledTimes(5);
  });

  it("keeps the database row when a Blob deletion fails and continues", async () => {
    mocks.userFindMany.mockResolvedValue([createUser("user-1")]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-1", blobUrl: "https://blob.test/1" },
      { id: "att-2", blobUrl: "https://blob.test/2" },
    ]);
    mocks.del
      .mockRejectedValueOnce(new Error("blob failed"))
      .mockResolvedValueOnce(undefined);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.attachmentDelete).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentDelete).toHaveBeenCalledWith({
      where: { id: "att-2" },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        scannedUsers: 1,
        processedUsers: 1,
        scannedAttachments: 2,
        deletedAttachments: 1,
        deletedBlobs: 1,
        missingBlobs: 0,
        errors: 1,
      },
      pagination: {
        hasMore: false,
        nextCursor: null,
        resumeCurrentUser: false,
      },
    });
  });

  it("deletes the row when the Blob is already absent", async () => {
    mocks.userFindMany.mockResolvedValue([createUser("user-1")]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-1", blobUrl: "https://blob.test/1" },
    ]);
    mocks.del.mockRejectedValue(new mocks.BlobNotFoundError());

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.attachmentDelete).toHaveBeenCalledWith({
      where: { id: "att-1" },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        scannedUsers: 1,
        processedUsers: 1,
        scannedAttachments: 1,
        deletedAttachments: 1,
        deletedBlobs: 0,
        missingBlobs: 1,
        errors: 0,
      },
      pagination: {
        hasMore: false,
        nextCursor: null,
        resumeCurrentUser: false,
      },
    });
  });

  it("uses the dedicated private voice-store credential for private voice cleanup", async () => {
    const privateVoiceUrl =
      "https://store.private.blob.vercel-storage.com/voice/chat-1/file.mp3";
    mocks.userFindMany.mockResolvedValue([createUser("user-1")]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-voice", blobUrl: privateVoiceUrl },
    ]);
    mocks.isPrivateVoiceBlobUrl.mockReturnValue(true);
    mocks.deletePrivateVoiceBlob.mockResolvedValue(undefined);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledWith(privateVoiceUrl);
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.attachmentDelete).toHaveBeenCalledWith({
      where: { id: "att-voice" },
    });
  });

  it("returns 500 on fatal cleanup errors", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db unavailable"));

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "db unavailable",
    });
  });

  it("GET delegates to POST behavior", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/cron/cleanup-attachments", {
        method: "GET",
        headers: { authorization: "Bearer secret-1" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        scannedUsers: 0,
        processedUsers: 0,
        scannedAttachments: 0,
        deletedAttachments: 0,
        deletedBlobs: 0,
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
});
