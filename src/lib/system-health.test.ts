import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  clerkGetUserList: vi.fn(),
  list: vi.fn(),
  queryRaw: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerkClient }));
vi.mock("@vercel/blob", () => ({ list: mocks.list }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { getSystemHealth } from "./system-health";

const originalEnv = { ...process.env };

describe("system health", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.CLERK_SECRET_KEY = "clerk-key";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-key";

    mocks.queryRaw.mockReset();
    mocks.clerkClient.mockReset();
    mocks.clerkGetUserList.mockReset();
    mocks.list.mockReset();
    mocks.fetch.mockReset();

    mocks.queryRaw.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
    mocks.clerkGetUserList.mockResolvedValue([]);
    mocks.clerkClient.mockResolvedValue({
      users: { getUserList: mocks.clerkGetUserList },
    });
    mocks.list.mockResolvedValue({ blobs: [], hasMore: false });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterAll(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns connected status when all checks pass", async () => {
    await expect(getSystemHealth()).resolves.toEqual({
      database: { status: "connected" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
    expect(mocks.clerkGetUserList).toHaveBeenCalledWith({ limit: 1 });
    expect(mocks.list).toHaveBeenCalledWith({ limit: 1, token: "blob-key" });
  });

  it("returns stable component errors", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("private database detail"));
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 });
    mocks.clerkGetUserList.mockRejectedValue(new Error("private Clerk detail"));
    mocks.list.mockRejectedValue(new Error("private Blob detail"));

    await expect(getSystemHealth()).resolves.toEqual({
      database: { status: "error", message: "Database check failed" },
      openrouter: { status: "error", message: "OpenRouter check failed" },
      clerk: { status: "error", message: "Clerk check failed" },
      vercelBlob: { status: "error", message: "Vercel Blob check failed" },
    });
  });

  it("reports missing provider configuration without making calls", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    await expect(getSystemHealth()).resolves.toMatchObject({
      openrouter: { message: "OPENROUTER_API_KEY not configured" },
      clerk: { message: "CLERK_SECRET_KEY not configured" },
      vercelBlob: { message: "BLOB_READ_WRITE_TOKEN not configured" },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
