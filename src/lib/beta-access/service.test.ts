import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configFindUnique: vi.fn(),
  configTxFindUnique: vi.fn(),
  configUpdate: vi.fn(),
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
  setBetaAccessEnabled,
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
      enabled: true,
      accessVersion: 2,
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        betaAccessConfig: {
          findUnique: mocks.configTxFindUnique,
          update: mocks.configUpdate,
          upsert: mocks.configUpsert,
        },
      }),
    );
  });

  it("treats an absent singleton as an inactive gate", async () => {
    mocks.configFindUnique.mockResolvedValue(null);

    await expect(loadBetaAccessConfig()).resolves.toEqual({
      configured: false,
      active: false,
    });
  });

  it("distinguishes a configured but disabled gate", async () => {
    mocks.configFindUnique.mockResolvedValue({
      enabled: false,
      accessVersion: 4,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });

    await expect(loadBetaAccessConfig()).resolves.toEqual({
      configured: true,
      active: false,
      accessVersion: 4,
      passwordDigest: "digest",
      activatedAt: now,
      rotatedAt: now,
    });
  });

  it("unlocks an active gate without linking an account", async () => {
    mocks.configFindUnique.mockResolvedValue({
      enabled: true,
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
      enabled: true,
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
        enabled: true,
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
        enabled: true,
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    });
    expect(summary).toEqual({
      configured: true,
      active: true,
      accessVersion: 2,
      activatedAt: now,
      rotatedAt: now,
    });
  });

  it("keeps a disabled gate disabled when rotating its password", async () => {
    mocks.configUpsert.mockResolvedValue({
      enabled: false,
      accessVersion: 3,
      activatedAt: now,
      rotatedAt: now,
    });

    await expect(
      rotateBetaAccessPassword("new shared password", "admin-1", now),
    ).resolves.toMatchObject({ configured: true, active: false });
    expect(mocks.configUpsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      "enabled",
    );
  });

  it("disables the gate and revokes existing cookies atomically", async () => {
    mocks.configTxFindUnique.mockResolvedValue({
      enabled: true,
      accessVersion: 4,
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.configUpdate.mockResolvedValue({
      enabled: false,
      accessVersion: 5,
      activatedAt: now,
      rotatedAt: now,
    });

    await expect(setBetaAccessEnabled(false, "admin-1")).resolves.toMatchObject(
      {
        status: "ok",
        config: { configured: true, active: false, accessVersion: 5 },
      },
    );
    expect(mocks.configUpdate).toHaveBeenCalledWith({
      where: { id: "global" },
      data: {
        enabled: false,
        accessVersion: { increment: 1 },
        updatedByUserId: "admin-1",
      },
      select: {
        enabled: true,
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    });
  });

  it("re-enables a configured gate without rotating its password", async () => {
    mocks.configTxFindUnique.mockResolvedValue({
      enabled: false,
      accessVersion: 5,
      activatedAt: now,
      rotatedAt: now,
    });
    mocks.configUpdate.mockResolvedValue({
      enabled: true,
      accessVersion: 5,
      activatedAt: now,
      rotatedAt: now,
    });

    await setBetaAccessEnabled(true, "admin-1");

    expect(mocks.configUpdate.mock.calls[0]?.[0].data).toEqual({
      enabled: true,
      updatedByUserId: "admin-1",
    });
  });

  it("cannot enable a gate before its first password is configured", async () => {
    mocks.configTxFindUnique.mockResolvedValue(null);

    await expect(setBetaAccessEnabled(true, "admin-1")).resolves.toEqual({
      status: "unconfigured",
    });
    expect(mocks.configUpdate).not.toHaveBeenCalled();
  });
});
