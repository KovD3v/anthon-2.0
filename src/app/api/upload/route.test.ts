import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  getAuthUser: vi.fn(),
  userFindUnique: vi.fn(),
  chatFindFirst: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentFindFirst: vi.fn(),
  attachmentDelete: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    chat: {
      findFirst: mocks.chatFindFirst,
    },
    attachment: {
      create: mocks.attachmentCreate,
      findFirst: mocks.attachmentFindFirst,
      delete: mocks.attachmentDelete,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import { DELETE, POST } from "./route";

function buildUploadRequest(formData: FormData): Request {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("/api/upload POST", () => {
  beforeEach(() => {
    mocks.put.mockReset();
    mocks.del.mockReset();
    mocks.getAuthUser.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.attachmentCreate.mockReset();
    mocks.attachmentFindFirst.mockReset();
    mocks.attachmentDelete.mockReset();
    mocks.checkRateLimit.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      isGuest: false,
      subscription: { status: "ACTIVE", planId: "my-basic-plan" },
    });
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      usage: {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
      },
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 1000,
        maxOutputTokensPerDay: 1000,
        maxCostPerDay: 10,
        maxContextMessages: 20,
      },
      percentUsed: { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    });
    mocks.chatFindFirst.mockResolvedValue({ id: "chat-1" });
    mocks.put.mockResolvedValue({
      url: "https://blob.example/uploaded",
      downloadUrl: "https://blob.example/download",
    });
    mocks.attachmentCreate.mockResolvedValue({
      id: "att-1",
      createdAt: new Date("2026-02-16T12:00:00.000Z"),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 429 when rate limit is denied", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      reason: "Daily request limit reached",
      usage: {
        requestCount: 10,
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
      },
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 1000,
        maxOutputTokensPerDay: 1000,
        maxCostPerDay: 10,
        maxContextMessages: 20,
      },
      upgradeInfo: null,
    });

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Daily request limit reached",
    });
  });

  it("returns 400 when no file is provided", async () => {
    const response = await POST(buildUploadRequest(new FormData()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No file provided",
    });
  });

  it("returns 400 when file size exceeds max", async () => {
    const largeData = new Uint8Array(10 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append(
      "file",
      new File([largeData], "big.txt", {
        type: "text/plain",
      }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File too large. Maximum size is 10MB",
    });
  });

  it("returns 400 for unsupported file type", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["binary"], "malware.exe", {
        type: "application/x-msdownload",
      }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File type not allowed: application/x-msdownload",
    });
  });

  it("accepts codec MIME values by stripping codec parameters", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["audio"], "voice.webm", {
        type: "audio/webm;codecs=opus",
      }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(File),
      expect.objectContaining({
        contentType: "audio/webm",
      }),
    );
  });

  it("accepts extension fallback when MIME type is empty", async () => {
    const form = new FormData();
    form.append("file", new File(["# markdown"], "guide.md"));

    // Use a direct formData() stub to preserve empty MIME type in Node runtime.
    const request = {
      formData: async () => form,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(File),
      expect.objectContaining({
        contentType: "text/markdown",
      }),
    );
  });

  it("returns 404 when chatId ownership check fails", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );
    form.append("chatId", "chat-404");

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("returns 500 when blob upload fails", async () => {
    mocks.put.mockRejectedValue(new Error("blob failed"));

    const form = new FormData();
    form.append(
      "file",
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "blob failed" });
  });

  it("uploads successfully with sanitized pathname and returns attachment payload", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const form = new FormData();
    form.append(
      "file",
      new File(["# content"], "my file.md", { type: "text/markdown" }),
    );
    form.append("chatId", "chat-1");

    const response = await POST(buildUploadRequest(form));

    expect(response.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(
      "attachments/user-1/chat-1/1700000000000-my_file.md",
      expect.any(File),
      {
        access: "public",
        contentType: "text/markdown",
      },
    );
    expect(mocks.attachmentCreate).toHaveBeenCalledWith({
      data: {
        name: "my file.md",
        contentType: "text/markdown",
        size: 9,
        blobUrl: "https://blob.example/uploaded",
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "att-1",
      url: "https://blob.example/uploaded",
      downloadUrl: "https://blob.example/download",
      name: "my file.md",
      contentType: "text/markdown",
      size: 9,
      createdAt: "2026-02-16T12:00:00.000Z",
    });

    nowSpy.mockRestore();
  });
});

describe("/api/upload DELETE", () => {
  beforeEach(() => {
    mocks.put.mockReset();
    mocks.del.mockReset();
    mocks.getAuthUser.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.attachmentCreate.mockReset();
    mocks.attachmentFindFirst.mockReset();
    mocks.attachmentDelete.mockReset();
    mocks.checkRateLimit.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.attachmentFindFirst.mockResolvedValue({
      id: "att-1",
      blobUrl: "https://blob.example/file",
    });
    mocks.attachmentDelete.mockResolvedValue({});
    mocks.del.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await DELETE(
      new Request("http://localhost/api/upload?url=https://blob.example/file"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when blob URL is missing", async () => {
    const response = await DELETE(new Request("http://localhost/api/upload"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Blob URL is required",
    });
  });

  it("returns 404 when upload ownership check fails", async () => {
    mocks.attachmentFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/upload?url=https://blob.example/file"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "File not found or access denied",
    });
  });

  it("returns 500 when blob deletion fails", async () => {
    mocks.del.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(
      new Request("http://localhost/api/upload?url=https://blob.example/file"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "delete failed" });
  });

  it("deletes file and DB record on success", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/upload?url=https://blob.example/file"),
    );

    expect(response.status).toBe(200);
    expect(mocks.attachmentFindFirst).toHaveBeenCalledWith({
      where: {
        blobUrl: "https://blob.example/file",
        OR: [
          { message: { userId: "user-1" } },
          {
            messageId: null,
            blobUrl: { contains: "/uploads/user-1/" },
          },
          {
            messageId: null,
            blobUrl: { contains: "/attachments/user-1/" },
          },
        ],
      },
      select: {
        id: true,
        blobUrl: true,
      },
    });
    expect(mocks.del).toHaveBeenCalledWith("https://blob.example/file");
    expect(mocks.attachmentDelete).toHaveBeenCalledWith({
      where: { id: "att-1" },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "File deleted successfully",
    });
  });
});
