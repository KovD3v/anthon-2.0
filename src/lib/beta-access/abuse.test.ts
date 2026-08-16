import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  fingerprint: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("./client-fingerprint", () => ({
  getBetaClientFingerprint: mocks.fingerprint,
}));

import {
  type BetaAbuseDeniedError,
  releaseBetaAction,
  reserveBetaAction,
} from "./abuse";

describe("beta abuse reservations", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.fingerprint.mockReturnValue("f".repeat(64));
    mocks.queryRaw.mockResolvedValue([{ attemptCount: 1 }]);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        betaAbuseBucket: {
          deleteMany: mocks.deleteMany,
          findUnique: mocks.findUnique,
          delete: mocks.delete,
          update: mocks.update,
        },
        $queryRaw: mocks.queryRaw,
      }),
    );
  });

  it("reserves an unlock attempt in a fifteen-minute bucket", async () => {
    const reservation = await reserveBetaAction(
      new Request("https://anthon.ai/beta-access"),
      "UNLOCK",
      new Date("2026-08-16T09:29:59.000Z"),
    );

    expect(reservation).toEqual({
      fingerprintHash: "f".repeat(64),
      action: "UNLOCK",
      windowStart: new Date("2026-08-16T09:15:00.000Z"),
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("uses an hourly bucket for mailing submissions", async () => {
    const reservation = await reserveBetaAction(
      new Request("https://anthon.ai/beta-access"),
      "MAILING_SUBSCRIPTION",
      new Date("2026-08-16T09:59:59.000Z"),
    );

    expect(reservation.windowStart).toEqual(
      new Date("2026-08-16T09:00:00.000Z"),
    );
  });

  it("fails closed when a trusted fingerprint is unavailable", async () => {
    mocks.fingerprint.mockReturnValue(null);

    await expect(
      reserveBetaAction(new Request("https://anthon.ai/beta-access"), "UNLOCK"),
    ).rejects.toMatchObject<BetaAbuseDeniedError>({
      reason: "identity_unavailable",
      status: 429,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an atomic reservation when the action limit is reached", async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await expect(
      reserveBetaAction(new Request("https://anthon.ai/beta-access"), "UNLOCK"),
    ).rejects.toMatchObject<BetaAbuseDeniedError>({
      reason: "limit_reached",
      status: 429,
    });
  });

  it("releases a successful unlock reservation", async () => {
    mocks.findUnique.mockResolvedValue({ id: "bucket-1", attemptCount: 2 });

    await releaseBetaAction({
      fingerprintHash: "f".repeat(64),
      action: "UNLOCK",
      windowStart: new Date("2026-08-16T09:15:00.000Z"),
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "bucket-1" },
      data: { attemptCount: { decrement: 1 } },
    });
  });
});
