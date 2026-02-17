import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  subscriptionUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    subscription: {
      upsert: mocks.subscriptionUpsert,
      findUnique: mocks.subscriptionFindUnique,
      update: mocks.subscriptionUpdate,
    },
  },
}));

import {
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "./subscription";

describe("clerk webhook subscription handlers", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockReset();
    mocks.subscriptionUpsert.mockReset();
    mocks.subscriptionFindUnique.mockReset();
    mocks.subscriptionUpdate.mockReset();

    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "TRIAL",
    });
  });

  it("handleSubscriptionCreated returns when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await handleSubscriptionCreated({
      id: "clerk-sub-1",
      user_id: "clerk-missing",
      status: "active",
    });

    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("handleSubscriptionCreated maps trial status and sets trial dates", async () => {
    await handleSubscriptionCreated({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "trialing",
      plan_id: "basic",
      plan_name: "Basic",
      trial_period_days: 7,
    });

    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: expect.objectContaining({
          status: "TRIAL",
          planId: "basic",
          planName: "Basic",
          trialStartedAt: expect.any(Date),
          trialEndsAt: expect.any(Date),
          convertedAt: undefined,
        }),
        create: expect.objectContaining({
          userId: "user-1",
          status: "TRIAL",
        }),
      }),
    );
  });

  it("handleSubscriptionCreated maps active status and sets convertedAt", async () => {
    await handleSubscriptionCreated({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "active",
      plan_id: "pro",
      plan_name: "Pro",
    });

    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "ACTIVE",
          convertedAt: expect.any(Date),
          trialStartedAt: undefined,
        }),
      }),
    );
  });

  it("handleSubscriptionCreated defaults unknown status to TRIAL", async () => {
    await handleSubscriptionCreated({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "weird_status",
    });

    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "TRIAL" }),
      }),
    );
  });

  it("handleSubscriptionUpdated returns when subscription is missing", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue(null);

    await handleSubscriptionUpdated({
      id: "clerk-sub-missing",
      user_id: "clerk-1",
      status: "active",
    });

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("handleSubscriptionUpdated tracks TRIAL -> ACTIVE conversion", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "TRIAL",
    });

    await handleSubscriptionUpdated({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "active",
      plan_id: "pro",
      plan_name: "Pro",
    });

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({
          status: "ACTIVE",
          planId: "pro",
          planName: "Pro",
          convertedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("handleSubscriptionUpdated tracks cancellation transitions", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "ACTIVE",
    });

    await handleSubscriptionUpdated({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "canceled",
    });

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELED",
          canceledAt: expect.any(Date),
        }),
      }),
    );
  });

  it("handleSubscriptionDeleted returns when subscription is missing", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue(null);

    await handleSubscriptionDeleted({
      id: "clerk-sub-missing",
      user_id: "clerk-1",
      status: "deleted",
    });

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("handleSubscriptionDeleted marks subscription as expired", async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "ACTIVE",
    });

    await handleSubscriptionDeleted({
      id: "clerk-sub-1",
      user_id: "clerk-1",
      status: "deleted",
    });

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: {
        status: "EXPIRED",
        canceledAt: expect.any(Date),
      },
    });
  });
});
