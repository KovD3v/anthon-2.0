import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  getRetentionParams: vi.fn(),
  archiveOldSessions: vi.fn(),
  verifyQStashAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/maintenance/retention-policy", () => ({
  getRetentionParams: mocks.getRetentionParams,
}));

vi.mock("@/lib/maintenance/session-archiver", () => ({
  archiveOldSessions: mocks.archiveOldSessions,
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

import { POST } from "./route";

describe("POST /api/queues/archive", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockReset();
    mocks.getRetentionParams.mockReset();
    mocks.archiveOldSessions.mockReset();
    mocks.verifyQStashAuth.mockReset();

    mocks.verifyQStashAuth.mockResolvedValue({ userId: "user-1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      subscription: { status: "ACTIVE", planId: "basic" },
    });
    mocks.getRetentionParams.mockReturnValue({ retentionDays: 30 });
    mocks.archiveOldSessions.mockResolvedValue(undefined);
  });

  it("returns 400 when userId is missing", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({});

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing userId");
  });

  it("returns 404 when user does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("User not found");
  });

  it("archives sessions and returns retention metadata", async () => {
    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: { subscription: true },
    });
    expect(mocks.getRetentionParams).toHaveBeenCalledWith({
      id: "user-1",
      subscription: { status: "ACTIVE", planId: "basic" },
    });
    expect(mocks.archiveOldSessions).toHaveBeenCalledWith("user-1", 30);
    await expect(response.json()).resolves.toEqual({
      success: true,
      retentionDays: 30,
    });
  });

  it("returns 400 on verification errors", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("invalid signature"));

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });

  it("returns 400 when archiving fails", async () => {
    mocks.archiveOldSessions.mockRejectedValue(new Error("archive failed"));

    const response = await POST({} as import("next/server").NextRequest);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Unauthorized or Error");
  });
});
