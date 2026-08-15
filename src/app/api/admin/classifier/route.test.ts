import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAiRoutingRuntimeConfig: vi.fn(),
  saveAiRoutingConfig: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/ai/ai-routing-config-store", () => ({
  getAiRoutingRuntimeConfig: mocks.getAiRoutingRuntimeConfig,
  saveAiRoutingConfig: mocks.saveAiRoutingConfig,
}));

import { GET, PUT } from "./route";

const runtimeConfig = {
  liveClassifierEnabled: false,
  executionRoutingMode: "active" as const,
  executionRoutingAllocationPercent: 50,
  executionRoutingTasks: ["social", "rewrite"] as const,
  source: "database" as const,
  updatedAt: new Date("2026-08-15T10:00:00.000Z"),
};

function putRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

describe("/api/admin/classifier", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.getAiRoutingRuntimeConfig.mockReset();
    mocks.saveAiRoutingConfig.mockReset();

    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      errorResponse: null,
    });
    mocks.getAiRoutingRuntimeConfig.mockResolvedValue(runtimeConfig);
    mocks.saveAiRoutingConfig.mockResolvedValue(runtimeConfig);
  });

  it("returns the effective config without exposing environment values", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "rewrite"],
        source: "database",
        updatedAt: "2026-08-15T10:00:00.000Z",
      },
      canEdit: true,
    });
  });

  it("requires admin access for global changes", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({ errorResponse: forbidden });

    const response = await PUT(
      putRequest({
        liveClassifierEnabled: false,
        executionRoutingMode: "off",
        executionRoutingAllocationPercent: 0,
        executionRoutingTasks: [],
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.saveAiRoutingConfig).not.toHaveBeenCalled();
  });

  it("rejects malformed allowlist updates before writing", async () => {
    const response = await PUT(
      putRequest({
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "social"],
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.saveAiRoutingConfig).not.toHaveBeenCalled();
  });

  it("persists a valid update and returns the effective config", async () => {
    const response = await PUT(
      putRequest({
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "rewrite"],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveAiRoutingConfig).toHaveBeenCalledWith(
      {
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "rewrite"],
      },
      "admin-1",
    );
    await expect(response.json()).resolves.toMatchObject({
      config: {
        source: "database",
        updatedAt: "2026-08-15T10:00:00.000Z",
      },
    });
  });
});
