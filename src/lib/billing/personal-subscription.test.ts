import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  getUserBillingSubscription: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    subscription: {
      upsert: mocks.subscriptionUpsert,
      updateMany: mocks.subscriptionUpdateMany,
    },
    user: {
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: vi.fn(),
  }),
}));

import { syncPersonalSubscriptionFromClerk } from "./personal-subscription";

describe("syncPersonalSubscriptionFromClerk", () => {
  beforeEach(() => {
    mocks.clerkClient.mockReset();
    mocks.getUserBillingSubscription.mockReset();
    mocks.subscriptionUpsert.mockReset();
    mocks.subscriptionUpdateMany.mockReset();
    mocks.userUpdate.mockReset();
    mocks.loggerWarn.mockReset();

    mocks.clerkClient.mockResolvedValue({
      billing: {
        getUserBillingSubscription: mocks.getUserBillingSubscription,
      },
    });
    mocks.getUserBillingSubscription.mockResolvedValue({
      id: "sub_1",
      subscriptionItems: [
        {
          id: "item_1",
          status: "active",
          isFreeTrial: false,
          planId: "my-basic-plan",
          plan: { name: "Basic" },
          nextPayment: null,
        },
      ],
    });
    mocks.subscriptionUpsert.mockResolvedValue({});
    mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userUpdate.mockResolvedValue({});
  });

  it("maps unknown Clerk billing status to EXPIRED and logs warning", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue({
      id: "sub_1",
      subscriptionItems: [
        {
          id: "item_1",
          status: "paused",
          isFreeTrial: false,
          planId: "my-basic-plan",
          plan: { name: "Basic" },
          nextPayment: null,
        },
      ],
    });

    const result = await syncPersonalSubscriptionFromClerk({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });

    expect(result).toEqual({
      status: "EXPIRED",
      planId: "my-basic-plan",
    });
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "EXPIRED",
        }),
        create: expect.objectContaining({
          status: "EXPIRED",
        }),
      }),
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "billing.unknown_status",
      "Unrecognized Clerk billing status",
      {
        billingStatus: "paused",
      },
    );
  });

  it("selects deterministic best item from multiple subscription items", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue({
      id: "sub_1",
      subscriptionItems: [
        {
          id: "item-z",
          status: "active",
          isFreeTrial: false,
          planId: "my-basic-plan",
          plan: { name: "Basic" },
          nextPayment: null,
        },
        {
          id: "item-a",
          status: "active",
          isFreeTrial: false,
          planId: "my-pro-plan",
          plan: { name: "Pro" },
          nextPayment: null,
        },
        {
          id: "item-b",
          status: "active",
          isFreeTrial: false,
          planId: "my-pro-plan",
          plan: { name: "Pro alt" },
          nextPayment: null,
        },
      ],
    });

    const result = await syncPersonalSubscriptionFromClerk({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: null,
    });

    expect(result).toEqual({
      status: "ACTIVE",
      planId: "my-pro-plan",
    });
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          planId: "my-pro-plan",
          planName: "Pro",
        }),
      }),
    );
  });

  it("prefers active items over free-trial items during selection", async () => {
    mocks.getUserBillingSubscription.mockResolvedValue({
      id: "sub_1",
      subscriptionItems: [
        {
          id: "trial-pro",
          status: "active",
          isFreeTrial: true,
          planId: "my-pro-plan",
          plan: { name: "Pro trial" },
          nextPayment: { date: "2026-02-20T10:00:00.000Z" },
        },
        {
          id: "active-basic",
          status: "active",
          isFreeTrial: false,
          planId: "my-basic-plan",
          plan: { name: "Basic active" },
          nextPayment: null,
        },
      ],
    });

    await syncPersonalSubscriptionFromClerk({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: null,
    });

    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "ACTIVE",
          planId: "my-basic-plan",
          planName: "Basic active",
        }),
      }),
    );
  });

  it("downgrades stale local subscription when Clerk subscription is not found", async () => {
    mocks.getUserBillingSubscription.mockRejectedValue({ status: 404 });

    const result = await syncPersonalSubscriptionFromClerk({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });

    expect(result).toEqual({
      status: "EXPIRED",
      planId: null,
    });
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        status: "EXPIRED",
        clerkSubscriptionId: null,
        planId: null,
        planName: null,
        trialEndsAt: null,
        canceledAt: expect.any(Date),
      },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        billingSyncedAt: expect.any(Date),
      },
    });
  });

  it("keeps null state when Clerk subscription is not found and no local state exists", async () => {
    mocks.getUserBillingSubscription.mockRejectedValue({ status: 404 });

    const result = await syncPersonalSubscriptionFromClerk({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: null,
    });

    expect(result).toBeNull();
    expect(mocks.subscriptionUpdateMany).not.toHaveBeenCalled();
  });
});
