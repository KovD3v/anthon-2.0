import type { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.queryRaw.mockReset();
    mocks.queryRaw.mockResolvedValue(undefined);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when the database check passes", async () => {
    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      database: { status: "connected" },
    });
  });

  it("returns degraded with a generic database error when the check fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.queryRaw.mockRejectedValue(new Error("db secret detail"));

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      database: {
        status: "error",
        message: "Database connection failed",
      },
    });
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
