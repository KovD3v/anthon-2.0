import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    betaMailingSubscriber: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import { listBetaSubscribers, subscribeToBetaMailing } from "./subscribers";

const now = new Date("2026-08-16T11:00:00.000Z");

describe("beta mailing subscribers", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        betaMailingSubscriber: {
          upsert: mocks.upsert,
          update: mocks.update,
        },
      }),
    );
    mocks.update.mockResolvedValue({ id: "subscriber-1" });
  });

  it("requires a valid email and explicit release consent", async () => {
    await expect(
      subscribeToBetaMailing(
        { email: "not-an-email", releaseConsent: true, updatesConsent: false },
        now,
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      subscribeToBetaMailing(
        {
          email: "person@example.com",
          releaseConsent: false,
          updatesConsent: false,
        },
        now,
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("normalizes a new subscriber and records optional updates consent", async () => {
    mocks.upsert.mockResolvedValue({
      id: "subscriber-1",
      updatesOptInAt: now,
      updatesOptOutAt: null,
    });

    await expect(
      subscribeToBetaMailing(
        {
          email: "  Person@Example.COM ",
          releaseConsent: true,
          updatesConsent: true,
        },
        now,
      ),
    ).resolves.toEqual({ success: true });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { normalizedEmail: "person@example.com" },
        create: expect.objectContaining({
          email: "Person@Example.COM",
          normalizedEmail: "person@example.com",
          releaseOptInAt: now,
          updatesOptInAt: now,
          updatesOptOutAt: null,
        }),
      }),
    );
  });

  it("records opt-out only when a previous updates consent is active", async () => {
    const previousOptIn = new Date("2026-08-01T09:00:00.000Z");
    mocks.upsert.mockResolvedValue({
      id: "subscriber-1",
      updatesOptInAt: previousOptIn,
      updatesOptOutAt: null,
    });

    await subscribeToBetaMailing(
      {
        email: "person@example.com",
        releaseConsent: true,
        updatesConsent: false,
      },
      now,
    );

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "subscriber-1" },
      data: { updatesOptOutAt: now },
      select: { id: true },
    });
  });

  it("uses the same success result for repeated submissions", async () => {
    mocks.upsert.mockResolvedValue({
      id: "subscriber-1",
      updatesOptInAt: null,
      updatesOptOutAt: null,
    });

    await expect(
      subscribeToBetaMailing(
        {
          email: "person@example.com",
          releaseConsent: true,
          updatesConsent: false,
        },
        now,
      ),
    ).resolves.toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("lists subscribers with pagination and active updates filter", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "subscriber-1",
        email: "person@example.com",
        releaseOptInAt: now,
        updatesOptInAt: now,
        updatesOptOutAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mocks.count
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(21)
      .mockResolvedValueOnce(18);

    const result = await listBetaSubscribers({
      page: 2,
      limit: 10,
      updatesOnly: true,
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { updatesOptInAt: { not: null }, updatesOptOutAt: null },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 18,
      totalPages: 2,
    });
    expect(result.metrics).toEqual({ total: 21, updates: 18 });
  });
});
