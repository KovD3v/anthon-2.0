import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reservationUpdateMany: vi.fn(),
  reservationDeleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aiUsageReservation: {
      updateMany: mocks.reservationUpdateMany,
      deleteMany: mocks.reservationDeleteMany,
    },
  },
}));

import { cleanupExpiredAiUsageReservations } from "./reservation-retention";

describe("AI usage reservation retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reservationUpdateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });
    mocks.reservationDeleteMany.mockResolvedValue({ count: 4 });
  });

  it("expires, clears recovery, and deletes terminal reservations globally", async () => {
    const now = new Date("2026-08-13T20:00:00.000Z");
    const result = await cleanupExpiredAiUsageReservations(now);

    expect(mocks.reservationUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { status: "RESERVED", expiresAt: { lte: now } },
      data: { status: "EXPIRED", releasedAt: now },
    });
    expect(mocks.reservationUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { status: "RECONCILED", recoveryExpiresAt: { lte: now } },
      data: {
        recoveryText: null,
        recoveryMetrics: expect.anything(),
        recoveryExpiresAt: null,
      },
    });
    expect(mocks.reservationDeleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["RECONCILED", "RELEASED", "EXPIRED"] },
        recoveryText: null,
        updatedAt: {
          lt: new Date("2026-07-14T20:00:00.000Z"),
        },
      },
    });
    expect(result).toEqual({ expired: 3, recoveryCleared: 2, deleted: 4 });
  });
});
