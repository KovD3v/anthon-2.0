import type { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  clerkGetUserList: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  queryRaw: vi.fn(),
  fetch: vi.fn(),
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

import { GET } from "./route";

const originalEnv = { ...process.env };

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.CLERK_SECRET_KEY = "clerk-key";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-key";

    mocks.queryRaw.mockReset();
    mocks.clerkClient.mockReset();
    mocks.clerkGetUserList.mockReset();
    mocks.put.mockReset();
    mocks.del.mockReset();
    mocks.fetch.mockReset();

    mocks.queryRaw.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
    mocks.clerkGetUserList.mockResolvedValue([]);
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUserList: mocks.clerkGetUserList,
      },
    });
    mocks.put.mockResolvedValue({ url: "https://blob.test/health-check-test.txt" });
    mocks.del.mockResolvedValue(undefined);

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterAll(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns connected status when all checks pass", async () => {
    const response = await GET({} as NextRequest);

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
    expect(mocks.put).toHaveBeenCalledWith("health-check-test.txt", "test", {
      access: "public",
    });
    expect(mocks.del).toHaveBeenCalledWith(
      "https://blob.test/health-check-test.txt",
    );

    await expect(response.json()).resolves.toEqual({
      database: { status: "connected" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
  });

  it("reports database error message when query fails", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("db down"));

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      database: { status: "error", message: "db down" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
  });

  it("reports missing OPENROUTER key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      openrouter: {
        status: "error",
        message: "OPENROUTER_API_KEY not configured",
      },
    });
  });

  it("reports OpenRouter API errors when model endpoint fails", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 });

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      openrouter: {
        status: "error",
        message: "API returned 401",
      },
    });
  });

  it("reports missing Clerk secret", async () => {
    delete process.env.CLERK_SECRET_KEY;

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      clerk: {
        status: "error",
        message: "CLERK_SECRET_KEY not configured",
      },
    });
  });

  it("reports missing Blob token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      vercelBlob: {
        status: "error",
        message: "BLOB_READ_WRITE_TOKEN not configured",
      },
    });
  });
});
