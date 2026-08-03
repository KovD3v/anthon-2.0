import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  clerkClient: vi.fn(),
  clerkGetUserList: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  queryRaw: vi.fn(),
  fetch: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/health", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("CLERK_SECRET_KEY", "clerk-key");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-key");
    vi.stubGlobal("fetch", mocks.fetch);

    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.queryRaw.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
    mocks.clerkGetUserList.mockResolvedValue([]);
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUserList: mocks.clerkGetUserList,
      },
    });
    mocks.put.mockResolvedValue({
      url: "https://blob.test/health/result.txt",
    });
    mocks.del.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["unauthenticated", 401],
    ["non-admin", 403],
  ])("rejects an %s request before provider work", async (_label, status) => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json(
        { error: status === 401 ? "Unauthorized" : "Forbidden" },
        { status },
      ),
    });

    const response = await GET();

    expect(response.status).toBe(status);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("returns connected status and removes its unique Blob probe", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      {
        headers: {
          Authorization: "Bearer or-key",
        },
      },
    );
    expect(mocks.clerkGetUserList).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^health\/[0-9a-f-]+\.txt$/),
      "test",
      { access: "public" },
    );
    expect(mocks.del).toHaveBeenCalledWith(
      "https://blob.test/health/result.txt",
    );
    await expect(response.json()).resolves.toEqual({
      database: { status: "connected" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
  });

  it.each([
    ["database", mocks.queryRaw, "Database check failed"],
    ["openrouter", mocks.fetch, "OpenRouter check failed"],
    ["clerk", mocks.clerkClient, "Clerk check failed"],
    ["vercelBlob", mocks.put, "Vercel Blob check failed"],
  ])(
    "redacts the raw %s provider error",
    async (service, providerMock, expectedMessage) => {
      providerMock.mockRejectedValue(new Error("sensitive provider detail"));

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body[service]).toEqual({
        status: "error",
        message: expectedMessage,
      });
      expect(JSON.stringify(body)).not.toContain("sensitive provider detail");
      expect(mocks.loggerError).toHaveBeenCalled();
    },
  );

  it("reports a redacted OpenRouter non-success response", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 429 });

    const response = await GET();
    const body = await response.json();

    expect(body.openrouter).toEqual({
      status: "error",
      message: "OpenRouter check failed",
    });
    expect(JSON.stringify(body)).not.toContain("429");
  });

  it("attempts Blob cleanup and redacts cleanup failures", async () => {
    mocks.del.mockRejectedValue(new Error("sensitive cleanup detail"));

    const response = await GET();
    const body = await response.json();

    expect(mocks.del).toHaveBeenCalledWith(
      "https://blob.test/health/result.txt",
    );
    expect(body.vercelBlob).toEqual({
      status: "error",
      message: "Vercel Blob cleanup failed",
    });
    expect(JSON.stringify(body)).not.toContain("sensitive cleanup detail");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "health.vercel_blob_cleanup_failed",
      "Vercel Blob health-check cleanup failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
