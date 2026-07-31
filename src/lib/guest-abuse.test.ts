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

function expectedFingerprint(
  address: string,
  secret = "guest-abuse-test-secret",
) {
  return createHmac("sha256", secret)
    .update("anthon:guest-creation-abuse:v1")
    .update("\0")
    .update(address)
    .digest("hex");
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
    const expectedHash = expectedFingerprint(address);

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

  it("normalizes proxy IPv4 ports, mapped IPv6, and bracketed IPv6", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    const cases = [
      ["203.0.113.42:443", "203.0.113.42"],
      ["::ffff:203.0.113.42", "203.0.113.42"],
      ["[2001:4860:4860::8888]:443", "2001:4860:4860::8888"],
    ] as const;

    for (const [header, normalized] of cases) {
      const result = await reserveGuestCreation(
        requestWithForwardedFor(header),
      );
      expect(result.fingerprintHash).toBe(expectedFingerprint(normalized));
    }
    expect(mocks.queryRaw).toHaveBeenCalledTimes(cases.length);
  });

  it("uses the first trusted proxy hop and falls back to x-real-ip", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    await expect(
      reserveGuestCreation(
        requestWithForwardedFor("198.51.100.7, 203.0.113.42"),
      ),
    ).resolves.toMatchObject({
      fingerprintHash: expectedFingerprint("198.51.100.7"),
    });

    await expect(
      reserveGuestCreation(
        new Request("https://anthon.app/api/guest/chat", {
          headers: {
            "x-forwarded-for": "not-an-address",
            "x-real-ip": "203.0.113.42",
          },
        }),
      ),
    ).resolves.toMatchObject({
      fingerprintHash: expectedFingerprint("203.0.113.42"),
    });
  });

  it("uses test and development identities only in their explicit environments", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    vi.stubEnv("NODE_ENV", "test");

    await expect(
      reserveGuestCreation(
        requestWithForwardedFor("203.0.113.42, 198.51.100.7"),
      ),
    ).resolves.toMatchObject({
      fingerprintHash: expectedFingerprint("203.0.113.42"),
    });

    vi.stubEnv("NODE_ENV", "development");
    await expect(
      reserveGuestCreation(new Request("https://anthon.app/api/guest/chat")),
    ).resolves.toMatchObject({
      fingerprintHash: expectedFingerprint("local-development"),
    });

    vi.stubEnv("NODE_ENV", "production");
    await expect(
      reserveGuestCreation(new Request("https://anthon.app/api/guest/chat")),
    ).rejects.toMatchObject({ reason: "identity_unavailable" });
  });

  it.each(["", "   ", "999.1.1.1", "::ffff:not-an-ip"])(
    "rejects an unusable trusted identity header %j",
    async (header) => {
      await expect(
        reserveGuestCreation(requestWithForwardedFor(header)),
      ).rejects.toMatchObject({ reason: "identity_unavailable" });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("falls back to the Clerk secret without persisting the source address", async () => {
    vi.stubEnv("GUEST_ABUSE_HMAC_SECRET", "   ");
    vi.stubEnv("CLERK_SECRET_KEY", "clerk-fallback-secret");

    await expect(
      reserveGuestCreation(requestWithForwardedFor("203.0.113.42")),
    ).resolves.toMatchObject({
      fingerprintHash: expectedFingerprint(
        "203.0.113.42",
        "clerk-fallback-secret",
      ),
    });
  });

  it.each([
    ["1", 1],
    ["100", 100],
    ["0", 3],
    ["101", 3],
    ["1.5", 3],
    ["invalid", 3],
  ])(
    "bounds configured daily creation limit %s to %i",
    async (value, limit) => {
      vi.stubEnv("GUEST_CREATIONS_PER_IP_PER_DAY", value);

      await reserveGuestCreation(requestWithForwardedFor("203.0.113.42"));

      const sql = mocks.queryRaw.mock.calls[0]?.[0] as { values?: unknown[] };
      expect(sql.values).toContain(limit);
    },
  );

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

  it("treats release of a missing bucket as an idempotent no-op", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await releaseGuestCreation({
      fingerprintHash: "hashed-address",
      windowStart: new Date("2026-07-31T00:00:00.000Z"),
    });

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
