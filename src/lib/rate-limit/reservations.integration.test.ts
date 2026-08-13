import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { reserveAiUsage } from "@/lib/rate-limit";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";

const finiteLimits = {
  maxRequestsPerDay: 10,
  maxInputTokensPerDay: 1_000,
  maxOutputTokensPerDay: 500,
  maxCostPerDay: 1,
  maxContextMessages: 20,
};

const infiniteLimits = {
  maxRequestsPerDay: Number.POSITIVE_INFINITY,
  maxInputTokensPerDay: Number.POSITIVE_INFINITY,
  maxOutputTokensPerDay: Number.POSITIVE_INFINITY,
  maxCostPerDay: Number.POSITIVE_INFINITY,
  maxContextMessages: 20,
};

function utcToday() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

describe("integration AI usage reservations", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
  });

  it("allows only one concurrent finite-plan reservation per user", async () => {
    const user = await createUser();

    const results = await Promise.all([
      reserveAiUsage({
        userId: user.id,
        requestKey: "concurrent-a",
        limits: finiteLimits,
      }),
      reserveAiUsage({
        userId: user.id,
        requestKey: "concurrent-b",
        limits: finiteLimits,
      }),
    ]);

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results).toContainEqual({
      allowed: false,
      reason: "Generation already in progress",
      retryable: true,
    });
    await expect(
      prisma.aiUsageReservation.count({
        where: { userId: user.id, status: "RESERVED" },
      }),
    ).resolves.toBe(1);
  });

  it("keeps a live duplicate request retryable without changing its claim", async () => {
    const user = await createUser();
    const original = await prisma.aiUsageReservation.create({
      data: {
        userId: user.id,
        date: utcToday(),
        requestKey: "live-duplicate",
        claimToken: "claim-live",
        status: "RESERVED",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      reserveAiUsage({
        userId: user.id,
        requestKey: original.requestKey,
        limits: finiteLimits,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "Generation already in progress",
      retryable: true,
    });
    await expect(
      prisma.aiUsageReservation.findUniqueOrThrow({
        where: { id: original.id },
        select: { claimToken: true, status: true },
      }),
    ).resolves.toEqual({ claimToken: "claim-live", status: "RESERVED" });
  });

  it("refreshes an expired duplicate request in place", async () => {
    const user = await createUser();
    const original = await prisma.aiUsageReservation.create({
      data: {
        userId: user.id,
        date: utcToday(),
        requestKey: "expired-duplicate",
        claimToken: "claim-expired",
        status: "RESERVED",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await reserveAiUsage({
      userId: user.id,
      requestKey: original.requestKey,
      limits: finiteLimits,
    });

    expect(result).toMatchObject({ allowed: true, reservationId: original.id });
    if (!result.allowed) throw new Error("Expected a refreshed reservation");
    expect(result.claimToken).not.toBe("claim-expired");
    const refreshed = await prisma.aiUsageReservation.findUniqueOrThrow({
      where: { id: original.id },
      select: { claimToken: true, status: true, expiresAt: true },
    });
    expect(refreshed.status).toBe("RESERVED");
    expect(refreshed.claimToken).toBe(result.claimToken);
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("recovers a reconciled response without creating a second reservation", async () => {
    const user = await createUser();
    const original = await prisma.aiUsageReservation.create({
      data: {
        userId: user.id,
        date: utcToday(),
        requestKey: "recovery-request",
        claimToken: "claim-recovery",
        status: "RECONCILED",
        expiresAt: new Date(Date.now() - 60_000),
        recoveryText: "Risposta recuperata",
        recoveryMetrics: {
          model: "test/model",
          inputTokens: 12,
          outputTokens: 7,
          costUsd: 0.02,
        },
        recoveryExpiresAt: new Date(Date.now() + 60_000),
        reconciledAt: new Date(),
      },
    });

    await expect(
      reserveAiUsage({
        userId: user.id,
        requestKey: original.requestKey,
        limits: finiteLimits,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reservationId: original.id,
      claimToken: "claim-recovery",
      recovery: { text: "Risposta recuperata" },
    });
    await expect(
      prisma.aiUsageReservation.count({
        where: { userId: user.id, requestKey: original.requestKey },
      }),
    ).resolves.toBe(1);
  });

  it("does not retry a reconciled request that has no recovery payload", async () => {
    const user = await createUser();
    await prisma.aiUsageReservation.create({
      data: {
        userId: user.id,
        date: utcToday(),
        requestKey: "accounted-request",
        claimToken: "claim-accounted",
        status: "RECONCILED",
        expiresAt: new Date(Date.now() - 60_000),
        reconciledAt: new Date(),
      },
    });

    await expect(
      reserveAiUsage({
        userId: user.id,
        requestKey: "accounted-request",
        limits: finiteLimits,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "Generation already accounted for",
      retryable: false,
    });
  });

  it.each([
    ["requestCount", "Daily request limit reached"],
    ["inputTokens", "Daily input token limit reached"],
    ["outputTokens", "Daily output token limit reached"],
    ["totalCostUsd", "Daily spending limit reached"],
  ] as const)("denies when daily %s is exhausted", async (field, reason) => {
    const user = await createUser();
    await prisma.dailyUsage.create({
      data: {
        userId: user.id,
        date: utcToday(),
        [field]:
          finiteLimits[
            (
              {
                requestCount: "maxRequestsPerDay",
                inputTokens: "maxInputTokensPerDay",
                outputTokens: "maxOutputTokensPerDay",
                totalCostUsd: "maxCostPerDay",
              } as const
            )[field]
          ],
      },
    });

    await expect(
      reserveAiUsage({
        userId: user.id,
        requestKey: `limit-${field}`,
        limits: finiteLimits,
      }),
    ).resolves.toEqual({ allowed: false, reason, retryable: false });
  });

  it("allows concurrent reservations when every plan budget is unlimited", async () => {
    const user = await createUser();

    const results = await Promise.all([
      reserveAiUsage({
        userId: user.id,
        requestKey: "unlimited-a",
        limits: infiniteLimits,
      }),
      reserveAiUsage({
        userId: user.id,
        requestKey: "unlimited-b",
        limits: infiniteLimits,
      }),
    ]);

    expect(results.every((result) => result.allowed)).toBe(true);
    await expect(
      prisma.aiUsageReservation.count({
        where: { userId: user.id, status: "RESERVED" },
      }),
    ).resolves.toBe(2);
  });
});
