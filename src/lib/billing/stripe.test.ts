import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeTestDatabaseUrl, getStripeTestOrigin } from "./config";
import { STRIPE_TEST_PLANS, validateStripePrice } from "./stripe-catalog";

const mocks = vi.hoisted(() => ({
  prices: vi.fn(),
  customers: vi.fn(),
  subscriptions: vi.fn(),
  checkoutList: vi.fn(),
  checkoutCreate: vi.fn(),
  expire: vi.fn(),
  cancel: vi.fn(),
  portalConfigurations: vi.fn(),
  portalCreate: vi.fn(),
  findSubscription: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("stripe", () => ({
  default: class {
    prices = { list: mocks.prices };
    customers = { create: mocks.customers };
    subscriptions = { list: mocks.subscriptions, cancel: mocks.cancel };
    checkout = {
      sessions: {
        list: mocks.checkoutList,
        create: mocks.checkoutCreate,
        expire: mocks.expire,
      },
    };
    billingPortal = {
      configurations: { list: mocks.portalConfigurations },
      sessions: { create: mocks.portalCreate },
    };
  },
}));
vi.mock("@/lib/db", () => {
  const tx = {
    subscription: {
      findUnique: mocks.findSubscription,
      upsert: mocks.upsert,
      update: mocks.update,
    },
    user: { findUnique: mocks.findUser, update: mocks.updateUser },
    $executeRaw: mocks.lock,
  };
  return {
    prisma: {
      ...tx,
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    },
  };
});

import {
  createStripeCheckout,
  createStripePortal,
  getStripe,
  handleStripeEvent,
  stripeSubscriptionState,
  syncPersonalSubscriptionFromStripe,
  withStripeAccountDeletion,
} from "./stripe";

const prices = Object.entries(STRIPE_TEST_PLANS).map(
  ([key, plan]) =>
    ({
      id: `price_${key}`,
      product: plan.productId,
      active: true,
      livemode: false,
      currency: "eur",
      unit_amount: plan.amount,
      lookup_key: plan.lookupKey,
      tax_behavior: "inclusive",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
    }) as Stripe.Price,
);
const activeSubscription = {
  id: "sub_paid",
  customer: "cus_user",
  livemode: false,
  status: "active",
  created: 123,
  items: { data: [{ price: prices[0], quantity: 1 }] },
} as Stripe.Subscription;

describe("isolated Stripe billing", () => {
  beforeEach(() => {
    vi.stubEnv("BILLING_PROVIDER", "stripe_test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_clerk");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stripe");
    vi.stubEnv("APP_URL", "http://localhost:3005");
    mocks.prices.mockResolvedValue({ data: prices, has_more: false });
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      isGuest: false,
      deletedAt: null,
    });
    mocks.findSubscription.mockResolvedValue({
      userId: "user-1",
      stripeCustomerId: "cus_user",
      status: "EXPIRED",
    });
    mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
    mocks.checkoutList.mockResolvedValue({ data: [], has_more: false });
    mocks.checkoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
      livemode: false,
    });
    mocks.portalConfigurations.mockResolvedValue({
      data: [
        {
          id: "bpc_test",
          livemode: false,
          metadata: { anthon: "stripe-eur-test" },
        },
      ],
    });
    mocks.portalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/test",
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects live keys, production, shared database endpoints and non-web origins", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_forbidden");
    expect(getStripe).toThrow("test key");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getStripeTestOrigin).toThrow("test environment");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv(
      "STRIPE_TEST_DATABASE_URL",
      "postgresql://test:pass@shared-pooler.example/test",
    );
    vi.stubEnv("DATABASE_URL", "postgresql://test:pass@shared.example/test");
    expect(getStripeTestDatabaseUrl).toThrow("existing database");
    vi.stubEnv("APP_URL", "https://anthon.chat");
    expect(getStripeTestOrigin).toThrow("localhost");
    vi.stubEnv("APP_URL", "ftp://localhost");
    expect(getStripeTestOrigin).toThrow();
  });

  it("accepts only the approved EUR monthly catalog", () => {
    expect(() => validateStripePrice(prices[0], "basic")).not.toThrow();
    for (const change of [
      { currency: "usd" },
      { unit_amount: 2500 },
      { livemode: true },
      { active: false },
      { product: "prod_other" },
      { recurring: { interval: "year" } },
    ]) {
      expect(() =>
        validateStripePrice(
          { ...prices[0], ...change } as Stripe.Price,
          "basic",
        ),
      ).toThrow();
    }
  });

  it("creates checkout from server prices and the authenticated customer", async () => {
    await createStripeCheckout("user-1", "basic_plus");
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_user",
        currency: "eur",
        adaptive_pricing: { enabled: false },
        allow_promotion_codes: true,
        line_items: [{ price: "price_basic_plus", quantity: 1 }],
        client_reference_id: "user-1",
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reuses pending checkout, expires a different plan and routes subscribers to their portal", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_open",
          metadata: { anthonPlan: "basic" },
          url: "https://checkout.stripe.com/existing",
          livemode: false,
        },
      ],
      has_more: false,
    });
    expect(await createStripeCheckout("user-1", "basic")).toContain("existing");
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    await createStripeCheckout("user-1", "basic_plus");
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    expect(await createStripeCheckout("user-1", "basic")).toContain(
      "billing.stripe.com",
    );
    expect(mocks.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_user" }),
    );
    await createStripePortal("user-1");
    expect(mocks.findSubscription).toHaveBeenLastCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("rejects deleted users and incomplete subscription collections", async () => {
    mocks.findUser.mockResolvedValue(null);
    await expect(createStripeCheckout("user-1", "basic")).rejects.toThrow(
      "cannot subscribe",
    );
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.subscriptions.mockResolvedValue({ data: [], has_more: true });
    await expect(createStripeCheckout("user-1", "basic")).rejects.toThrow(
      "collection",
    );
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("grants access only to active paid subscriptions, retaining access until scheduled cancellation", () => {
    expect(
      stripeSubscriptionState({
        ...activeSubscription,
        cancel_at_period_end: true,
      }),
    ).toBe("ACTIVE");
    for (const [status, expected] of [
      ["incomplete", "EXPIRED"],
      ["trialing", "EXPIRED"],
      ["unpaid", "EXPIRED"],
      ["paused", "EXPIRED"],
      ["past_due", "PAST_DUE"],
      ["canceled", "CANCELED"],
    ]) {
      expect(
        stripeSubscriptionState({
          ...activeSubscription,
          status,
        } as Stripe.Subscription),
      ).toBe(expected);
    }
  });

  it("reconciles current state for duplicate and out-of-order signed events", async () => {
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    expect(await syncPersonalSubscriptionFromStripe("user-1")).toEqual({
      status: "ACTIVE",
      planId: "stripe_test:basic",
    });
    mocks.subscriptions.mockResolvedValue({
      data: [{ ...activeSubscription, status: "canceled" }],
      has_more: false,
    });
    const staleEvent = {
      id: "evt_old",
      type: "customer.subscription.created",
      livemode: false,
      data: { object: activeSubscription },
    } as Stripe.Event;
    await handleStripeEvent(staleEvent);
    await handleStripeEvent(staleEvent);
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELED" }),
      }),
    );
    await expect(
      handleStripeEvent({ ...staleEvent, livemode: true }),
    ).rejects.toThrow("test events");
  });

  it("expires checkout and cancels recurring billing before deleting account data", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [{ id: "cs_pending", livemode: false }],
      has_more: false,
    });
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    const remove = vi.fn(async () => {
      expect(mocks.expire).toHaveBeenCalledWith("cs_pending");
      expect(mocks.cancel).toHaveBeenCalledWith("sub_paid", {
        prorate: false,
        invoice_now: false,
      });
    });
    await withStripeAccountDeletion("user-1", remove);
    expect(remove).toHaveBeenCalledOnce();
    mocks.cancel.mockRejectedValueOnce(new Error("Stripe unavailable"));
    await expect(withStripeAccountDeletion("user-1", remove)).rejects.toThrow(
      "Stripe unavailable",
    );
    expect(remove).toHaveBeenCalledOnce();
  });
});
