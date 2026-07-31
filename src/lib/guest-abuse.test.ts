import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { releaseGuestCreation, reserveGuestCreation } from "./guest-abuse";

const tx = {
  guestAbuseBucket: {
    deleteMany: mocks.deleteMany,
    findUnique: mocks.findUnique,
    delete: mocks.delete,
    update: mocks.update,
  },
  $queryRaw: mocks.queryRaw,
};

function requestWithForwardedFor(value: string) {
  return new Request("https://anthon.app/api/guest/chat", {
    headers: { "x-forwarded-for": value },
  });
}

describe("guest creation abuse reservations", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.transaction.mockReset();
    mocks.deleteMany.mockReset();
    mocks.queryRaw.mockReset();
    mocks.findUnique.mockReset();
    mocks.delete.mockReset();
    mocks.update.mockReset();

    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GUEST_ABUSE_HMAC_SECRET", "guest-abuse-test-secret");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("GUEST_CREATIONS_PER_IP_PER_DAY", "3");
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.queryRaw.mockResolvedValue([{ createdSessions: 1 }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hashes one trusted Vercel address without exposing the source address", async () => {
    const address = "203.0.113.42";
    const expectedHash = createHmac("sha256", "guest-abuse-test-secret")
      .update("anthon:guest-creation-abuse:v1")
      .update("\0")
      .update(address)
      .digest("hex");

    const reservation = await reserveGuestCreation(
      requestWithForwardedFor(address),
    );

    expect(reservation.fingerprintHash).toBe(expectedHash);
    expect(reservation.fingerprintHash).not.toContain(address);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();

    const sql = mocks.queryRaw.mock.calls[0]?.[0] as {
      values?: unknown[];
    };
    expect(sql.values).toContain(expectedHash);
    expect(sql.values).not.toContain(address);
    expect(JSON.stringify(sql)).not.toContain(address);
  });

  it("rejects a forwarded address list on Vercel before touching the database", async () => {
    await expect(
      reserveGuestCreation(
        requestWithForwardedFor("203.0.113.42, 198.51.100.7"),
      ),
    ).rejects.toMatchObject({
      reason: "identity_unavailable",
      status: 429,
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed when no HMAC secret is configured", async () => {
    vi.stubEnv("GUEST_ABUSE_HMAC_SECRET", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    await expect(
      reserveGuestCreation(requestWithForwardedFor("203.0.113.42")),
    ).rejects.toMatchObject({
      reason: "identity_unavailable",
      status: 429,
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies the reservation when the atomic conditional upsert reaches its cap", async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await expect(
      reserveGuestCreation(requestWithForwardedFor("203.0.113.42")),
    ).rejects.toMatchObject({
      reason: "daily_limit_reached",
      status: 429,
    });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("decrements a multi-use bucket and deletes its final reservation", async () => {
    const reservation = {
      fingerprintHash: "hashed-address",
      windowStart: new Date("2026-07-31T00:00:00.000Z"),
    };
    mocks.findUnique
      .mockResolvedValueOnce({ id: "bucket-1", createdSessions: 2 })
      .mockResolvedValueOnce({ id: "bucket-1", createdSessions: 1 });

    await releaseGuestCreation(reservation);
    await releaseGuestCreation(reservation);

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "bucket-1" },
      data: { createdSessions: { decrement: 1 } },
    });
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "bucket-1" } });
  });
});
