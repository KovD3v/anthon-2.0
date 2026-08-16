import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configFindUnique: vi.fn(),
  transaction: vi.fn(),
  configUpsert: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    betaAccessConfig: { findUnique: mocks.configFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./password", () => ({
  hashBetaPassword: mocks.hashPassword,
  verifyBetaPassword: mocks.verifyPassword,
}));

import { signBetaAccessCookie } from "./cookie";
import {
  isCurrentBetaAccessCookie,
  loadBetaAccessConfig,
  rotateBetaAccessPassword,
  unlockBetaAccess,
} from "./service";

const secret = "test-cookie-secret-that-is-long-enough";
const now = new Date("2026-08-16T10:00:00.000Z");

describe("beta access service", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.hashPassword.mockResolvedValue("scrypt-digest");
    mocks.configUpsert.mockResolvedValue({
      accessVersion: 2,
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.transaction.mockImplementation((callback) =>
      callback({ betaAccessConfig: { upsert: mocks.configUpsert } }),
    );
  });

  it("treats an absent singleton as an inactive gate", async () => {
    mocks.configFindUnique.mockResolvedValue(null);

    await expect(loadBetaAccessConfig()).resolves.toEqual({ active: false });
  });

  it("returns only the active configuration fields needed by the gate", async () => {
    mocks.configFindUnique.mockResolvedValue({
      accessVersion: 4,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });

    await expect(loadBetaAccessConfig()).resolves.toEqual({
      active: true,
      accessVersion: 4,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });
  });

  it("unlocks an active gate without linking an account", async () => {
    mocks.configFindUnique.mockResolvedValue({
      accessVersion: 4,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.verifyPassword.mockResolvedValue(true);

    const result = await unlockBetaAccess("shared-password", { secret, now });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected successful unlock");
    expect(result.accessVersion).toBe(4);
    expect(
      isCurrentBetaAccessCookie(result.cookieValue, 4, { secret, now }),
    ).toBe(true);
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "shared-password",
      "digest",
    );
  });

  it("returns neutral inactive and invalid outcomes", async () => {
    mocks.configFindUnique.mockResolvedValueOnce(null);
    await expect(
      unlockBetaAccess("password", { secret, now }),
    ).resolves.toEqual({ status: "inactive" });

    mocks.configFindUnique.mockResolvedValueOnce({
      accessVersion: 1,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.verifyPassword.mockResolvedValue(false);
    await expect(
      unlockBetaAccess("password", { secret, now }),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("rejects missing, malformed, and stale cookie credentials", () => {
    const current = signBetaAccessCookie({
      configVersion: 2,
      secret,
      now,
      nonce: "fixed-nonce",
    });

    expect(isCurrentBetaAccessCookie(null, 2, { secret, now })).toBe(false);
    expect(isCurrentBetaAccessCookie(current, 3, { secret, now })).toBe(false);
    expect(isCurrentBetaAccessCookie(current, 2, { secret: "", now })).toBe(
      false,
    );
    expect(isCurrentBetaAccessCookie(current, 2, { secret, now })).toBe(true);
  });

  it("rotates the digest and increments the global version atomically", async () => {
    const summary = await rotateBetaAccessPassword(
      "new shared password",
      "admin-1",
      now,
    );

    expect(mocks.configUpsert).toHaveBeenCalledWith({
      where: { id: "global" },
      create: {
        id: "global",
        passwordDigest: "scrypt-digest",
        accessVersion: 1,
        activatedAt: now,
        rotatedAt: now,
        updatedByUserId: "admin-1",
      },
      update: {
        passwordDigest: "scrypt-digest",
        accessVersion: { increment: 1 },
        rotatedAt: now,
        updatedByUserId: "admin-1",
      },
      select: {
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    });
    expect(summary).toEqual({
      active: true,
      accessVersion: 2,
      activatedAt: now,
      rotatedAt: now,
    });
  });
});
