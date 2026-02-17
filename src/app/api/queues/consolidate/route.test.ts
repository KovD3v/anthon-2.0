import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consolidateMemories: vi.fn(),
  verifyQStashAuth: vi.fn(),
}));

vi.mock("@/lib/maintenance/memory-consolidation", () => ({
  consolidateMemories: mocks.consolidateMemories,
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

import { POST } from "./route";

describe("POST /api/queues/consolidate", () => {
  beforeEach(() => {
    mocks.consolidateMemories.mockReset();
    mocks.verifyQStashAuth.mockReset();

    mocks.verifyQStashAuth.mockResolvedValue({ userId: "user-1" });
    mocks.consolidateMemories.mockResolvedValue(undefined);
  });

  it("returns 400 when userId is missing", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({});

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing userId");
  });

  it("consolidates memories and returns success", async () => {
    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(200);
    expect(mocks.consolidateMemories).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      success: true,
      verified: true,
    });
  });

  it("returns 400 when auth verification fails", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("invalid signature"));

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });

  it("returns 400 when consolidation fails", async () => {
    mocks.consolidateMemories.mockRejectedValue(new Error("consolidation failed"));

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });
});
