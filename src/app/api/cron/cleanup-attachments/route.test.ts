import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  userFindMany: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentDelete: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: mocks.del,
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

describe("/api/cron/cleanup-attachments", () => {
  beforeEach(() => {
    mocks.del.mockReset();
    mocks.userFindMany.mockReset();
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentDelete.mockReset();

    process.env.CRON_SECRET = "secret-1";

    mocks.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        role: "USER",
        isGuest: false,
        subscription: { status: "ACTIVE", planId: "my-pro-plan" },
      },
      {
        id: "user-2",
        role: "USER",
        isGuest: true,
        subscription: null,
      },
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
  });

  it("cleans up expired attachments and reports stats", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-attachments", {
        method: "POST",
        headers: { authorization: "Bearer secret-1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        role: true,
        isGuest: true,
        subscription: {
          select: {
            status: true,
            planId: true,
          },
        },
      },
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
        processedUsers: 1,
        deletedAttachments: 2,
        deletedBlobs: 1,
        errors: 0,
      },
    });
  });

  it("continues cleanup when single attachment deletion fails", async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        role: "USER",
        isGuest: false,
        subscription: { status: "ACTIVE", planId: "basic" },
      },
    ]);
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentFindMany.mockResolvedValue([
      { id: "att-1", blobUrl: "https://blob.test/1" },
      { id: "att-2", blobUrl: "https://blob.test/2" },
    ]);
    mocks.del
      .mockRejectedValueOnce(new Error("blob failed"))
      .mockResolvedValueOnce(undefined);

    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-attachments", {
        method: "POST",
        headers: { authorization: "Bearer secret-1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.attachmentDelete).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Attachment cleanup complete",
      stats: {
        processedUsers: 1,
        deletedAttachments: 1,
        deletedBlobs: 1,
        errors: 1,
      },
    });
  });

  it("returns 500 on fatal cleanup errors", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db unavailable"));

    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-attachments", {
        method: "POST",
        headers: { authorization: "Bearer secret-1" },
      }),
    );

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
        processedUsers: 0,
        deletedAttachments: 0,
        deletedBlobs: 0,
        errors: 0,
      },
    });
  });
});
