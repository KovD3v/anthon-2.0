import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  reservationFindMany: vi.fn(),
  reservationUpdateMany: vi.fn(),
  reservationDeleteMany: vi.fn(),
  reservationCreate: vi.fn(),
  reservationFindUnique: vi.fn(),
  reservationUpdate: vi.fn(),
  usageFindUnique: vi.fn(),
  usageUpsert: vi.fn(),
  usageUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  commitUploadReservationInTransaction,
  releaseUploadReservation,
  reserveUploadQuota,
} from "./quota";

const tx = {
  $queryRaw: mocks.queryRaw,
  $executeRaw: mocks.executeRaw,
  uploadReservation: {
    findMany: mocks.reservationFindMany,
    updateMany: mocks.reservationUpdateMany,
    deleteMany: mocks.reservationDeleteMany,
    create: mocks.reservationCreate,
    findUnique: mocks.reservationFindUnique,
    update: mocks.reservationUpdate,
  },
  dailyUploadUsage: {
    findUnique: mocks.usageFindUnique,
    upsert: mocks.usageUpsert,
    update: mocks.usageUpdate,
  },
};

const limits = {
  maxUploadsPerDay: 5,
  maxUploadBytesPerDay: 1_000,
};

describe("upload quota reservations", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.queryRaw.mockResolvedValue([{ id: "user-1" }]);
    mocks.executeRaw.mockResolvedValue(0);
    mocks.reservationFindMany.mockResolvedValue([]);
    mocks.reservationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.reservationDeleteMany.mockResolvedValue({ count: 0 });
    mocks.reservationCreate.mockResolvedValue({ id: "upload-reservation-1" });
    mocks.usageFindUnique.mockResolvedValue(null);
    mocks.usageUpsert.mockResolvedValue({
      uploadCount: 0,
      uploadedBytes: BigInt(0),
      reservedCount: 1,
      reservedBytes: BigInt(250),
    });
  });

  it("reserves one upload and its exact byte count", async () => {
    const result = await reserveUploadQuota({
      userId: "user-1",
      byteCount: 250,
      limits,
    });

    expect(result).toEqual({
      allowed: true,
      reservationId: "upload-reservation-1",
      usage: {
        uploadCount: 0,
        uploadedBytes: 0,
        reservedCount: 1,
        reservedBytes: 250,
      },
      limits,
    });
    expect(mocks.reservationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        byteCount: BigInt(250),
      }),
    });
    expect(mocks.usageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reservedCount: 1,
          reservedBytes: BigInt(250),
        }),
        update: {
          reservedCount: { increment: 1 },
          reservedBytes: { increment: BigInt(250) },
        },
      }),
    );
  });

  it("denies a reservation when committed and reserved uploads exhaust the count", async () => {
    mocks.usageFindUnique.mockResolvedValue({
      uploadCount: 3,
      uploadedBytes: BigInt(100),
      reservedCount: 2,
      reservedBytes: BigInt(100),
    });

    const result = await reserveUploadQuota({
      userId: "user-1",
      byteCount: 10,
      limits,
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "Daily upload count reached",
    });
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.usageUpsert).not.toHaveBeenCalled();
  });

  it("denies a reservation when committed, reserved, and new bytes exceed the limit", async () => {
    mocks.usageFindUnique.mockResolvedValue({
      uploadCount: 1,
      uploadedBytes: BigInt(700),
      reservedCount: 1,
      reservedBytes: BigInt(200),
    });

    const result = await reserveUploadQuota({
      userId: "user-1",
      byteCount: 101,
      limits,
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "Daily upload bytes reached",
    });
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.usageUpsert).not.toHaveBeenCalled();
  });

  it("commits a reservation exactly once", async () => {
    const reservation = {
      id: "upload-reservation-1",
      userId: "user-1",
      date: new Date("2026-07-31T00:00:00.000Z"),
      byteCount: BigInt(250),
      status: "RESERVED",
    };
    mocks.reservationFindUnique
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ ...reservation, status: "COMMITTED" });

    const first = await commitUploadReservationInTransaction(tx as never, {
      reservationId: reservation.id,
      userId: reservation.userId,
    });
    const duplicate = await commitUploadReservationInTransaction(tx as never, {
      reservationId: reservation.id,
      userId: reservation.userId,
    });

    expect(first).toEqual({ committed: true });
    expect(duplicate).toEqual({ committed: false });
    expect(mocks.usageUpdate).toHaveBeenCalledOnce();
    expect(mocks.usageUpdate).toHaveBeenCalledWith({
      where: {
        userId_date: {
          userId: "user-1",
          date: reservation.date,
        },
      },
      data: {
        uploadCount: { increment: 1 },
        uploadedBytes: { increment: BigInt(250) },
        reservedCount: { decrement: 1 },
        reservedBytes: { decrement: BigInt(250) },
      },
    });
    expect(mocks.reservationUpdate).toHaveBeenCalledOnce();
  });

  it("releases a reservation once and leaves terminal reservations unchanged", async () => {
    const reservation = {
      id: "upload-reservation-1",
      userId: "user-1",
      date: new Date("2026-07-31T00:00:00.000Z"),
      byteCount: BigInt(250),
      status: "RESERVED",
    };
    mocks.reservationFindUnique
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ ...reservation, status: "RELEASED" });

    await expect(
      releaseUploadReservation({
        reservationId: reservation.id,
        userId: reservation.userId,
      }),
    ).resolves.toBe(true);
    await expect(
      releaseUploadReservation({
        reservationId: reservation.id,
        userId: reservation.userId,
      }),
    ).resolves.toBe(false);

    expect(mocks.reservationUpdate).toHaveBeenCalledOnce();
    expect(mocks.reservationUpdate).toHaveBeenCalledWith({
      where: { id: reservation.id },
      data: { status: "RELEASED", releasedAt: expect.any(Date) },
    });
    expect(mocks.usageUpdate).toHaveBeenCalledOnce();
    expect(mocks.usageUpdate).toHaveBeenCalledWith({
      where: {
        userId_date: {
          userId: "user-1",
          date: reservation.date,
        },
      },
      data: {
        reservedCount: { decrement: 1 },
        reservedBytes: { decrement: BigInt(250) },
      },
    });
  });
});
