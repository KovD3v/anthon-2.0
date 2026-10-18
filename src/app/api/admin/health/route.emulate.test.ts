import { list } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the admin guard and the database stay mocked. Clerk and Vercel Blob are
// real SDK calls over HTTP to the local Emulate services (see vitest.emulate.config.ts).
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { GET } from "./route";

describe("GET /api/admin/health against Emulate", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  });

  it("reaches Clerk and round-trips a Vercel Blob object", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      database: { status: "connected" },
      openrouter: { status: "error", message: "OpenRouter is not configured" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
    // The probe blob was written and then deleted in the emulated store.
    const { blobs } = await list({ prefix: "health/" });
    expect(blobs).toEqual([]);
  });

  it("reports Blob as failing when the store rejects the token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "not-a-blob-token");

    const body = await (await GET()).json();

    expect(body.vercelBlob).toEqual({
      status: "error",
      message: "Vercel Blob check failed",
    });
    expect(body.clerk).toEqual({ status: "connected" });
  });
});
