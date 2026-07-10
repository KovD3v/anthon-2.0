import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSystemHealth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/system-health", () => ({
  getSystemHealth: mocks.getSystemHealth,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.getSystemHealth.mockReset();
    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.getSystemHealth.mockResolvedValue({
      database: { status: "connected" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
  });

  it("returns shallow liveness publicly without calling providers", async () => {
    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.getSystemHealth).not.toHaveBeenCalled();
  });

  it("requires admin access for detailed health", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/health?details=1"),
    );

    expect(response.status).toBe(403);
    expect(mocks.getSystemHealth).not.toHaveBeenCalled();
  });

  it("returns live provider health to admins", async () => {
    const response = await GET(
      new Request("http://localhost/api/health?details=1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      database: { status: "connected" },
      openrouter: { status: "connected" },
      clerk: { status: "connected" },
      vercelBlob: { status: "connected" },
    });
  });
});
