import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeUserProfile: vi.fn(),
  verifyQStashAuth: vi.fn(),
}));

vi.mock("@/lib/maintenance/profile-analyzer", () => ({
  analyzeUserProfile: mocks.analyzeUserProfile,
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

import { POST } from "./route";

describe("POST /api/queues/analyze", () => {
  beforeEach(() => {
    mocks.analyzeUserProfile.mockReset();
    mocks.verifyQStashAuth.mockReset();

    mocks.verifyQStashAuth.mockResolvedValue({ userId: "user-1" });
    mocks.analyzeUserProfile.mockResolvedValue(undefined);
  });

  it("returns 400 when userId is missing", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({});

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing userId");
  });

  it("analyzes profile and returns success", async () => {
    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(200);
    expect(mocks.analyzeUserProfile).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 400 when auth verification or analysis fails", async () => {
    mocks.analyzeUserProfile.mockRejectedValue(new Error("analysis failed"));

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });
});
