import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeTestDatabaseUrl, getStripeTestOrigin } from "./config";
import {
  getStripePlans,
  STRIPE_TEST_PLANS,
  validateStripePrice,
} from "./stripe-catalog";

const mocks = vi.hoisted(() => ({
  prices: vi.fn(),
  customers: vi.fn(),
  subscriptions: vi.fn(),
  checkoutList: vi.fn(),
  checkoutCreate: vi.fn(),
  expire: vi.fn(),
  cancel: vi.fn(),
  retrieveCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  updateSubscription: vi.fn(),
  setupCreate: vi.fn(),
  setupRetrieve: vi.fn(),
  paymentMethod: vi.fn(),
  invoices: vi.fn(),
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
    customers = {
      create: mocks.customers,
      retrieve: mocks.retrieveCustomer,
      update: mocks.updateCustomer,
    };
    subscriptions = {
      list: mocks.subscriptions,
      cancel: mocks.cancel,
      update: mocks.updateSubscription,
    };
    setupIntents = { create: mocks.setupCreate, retrieve: mocks.setupRetrieve };
    paymentMethods = { retrieve: mocks.paymentMethod };
    invoices = { list: mocks.invoices };
    checkout = {
      sessions: {
        list: mocks.checkoutList,
        create: mocks.checkoutCreate,
        expire: mocks.expire,
      },
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
  confirmStripePaymentMethod,
  createStripeCheckout,
  createStripePaymentMethodSetup,
  getStripe,
  getStripeBillingSummary,
  handleStripeEvent,
  setStripeCancellation,
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
        interval: plan.interval,
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
  cancel_at_period_end: false,
  items: {
    data: [{ price: prices[0], quantity: 1, current_period_end: 4102444800 }],
  },
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
      client_secret: "cs_test_secret",
      livemode: false,
    });
    mocks.retrieveCustomer.mockResolvedValue({
      id: "cus_user",
      livemode: false,
      metadata: { anthonUserId: "user-1" },
      invoice_settings: { default_payment_method: "pm_card" },
    });
    mocks.paymentMethod.mockResolvedValue({
      id: "pm_card",
      customer: "cus_user",
      livemode: false,
      type: "card",
      card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
    });
    mocks.invoices.mockResolvedValue({ data: [] });
    mocks.setupCreate.mockResolvedValue({
      client_secret: "seti_secret",
      livemode: false,
    });
    mocks.setupRetrieve.mockResolvedValue({
      customer: "cus_user",
      livemode: false,
      status: "succeeded",
      metadata: { anthonUserId: "user-1" },
      payment_method: "pm_card",
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("offers annual billing without launch promotions and resolves its canonical entitlement", async () => {
    await createStripeCheckout("user-1", "pro_annual");
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_promotion_codes: false,
        line_items: [{ price: "price_pro_annual", quantity: 1 }],
      }),
    );
    mocks.subscriptions.mockResolvedValue({
      data: [
        {
          ...activeSubscription,
          items: {
            data: [
              {
                ...activeSubscription.items.data[0],
                price: prices.find((p) => p.id === "price_pro_annual"),
              },
            ],
          },
        },
      ],
      has_more: false,
    });
    expect(await syncPersonalSubscriptionFromStripe("user-1")).toEqual({
      status: "ACTIVE",
      planId: "stripe_test:pro",
    });
    expect(
      (await getStripeBillingSummary("user-1")).subscription,
    ).toMatchObject({ amount: 49999, interval: "year", plan: "pro_annual" });
  });

  it("accepts matching live resources only with production credentials and a secure origin", async () => {
    vi.stubEnv("BILLING_PROVIDER", "stripe_live");
    expect(getStripe).toThrow("production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_clerk");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_stripe");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_stripe");
    expect(getStripe).toThrow("HTTPS");
    vi.stubEnv("APP_URL", "https://anthon.example");
    expect(getStripe).not.toThrow();
    const plans = getStripePlans();
    const livePrices = prices.map((price, index) => {
      const plan = Object.values(plans)[index];
      return {
        ...price,
        livemode: true,
        product: plan.productId,
        lookup_key: plan.lookupKey,
      };
    });
    mocks.prices.mockResolvedValue({ data: livePrices, has_more: false });
    await expect(createStripeCheckout("user-1", "basic")).rejects.toThrow(
      "checkout",
    );
    mocks.checkoutCreate.mockResolvedValue({
      client_secret: "cs_live_secret",
      livemode: true,
    });
    expect(await createStripeCheckout("user-1", "basic")).toEqual({
      clientSecret: "cs_live_secret",
    });
    mocks.subscriptions.mockResolvedValue({
      data: [
        {
          ...activeSubscription,
          livemode: true,
          items: {
            data: [
              { ...activeSubscription.items.data[0], price: livePrices[0] },
            ],
          },
        },
      ],
      has_more: false,
    });
    expect(await syncPersonalSubscriptionFromStripe("user-1")).toEqual({
      status: "ACTIVE",
      planId: "stripe_live:basic",
    });
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    await expect(syncPersonalSubscriptionFromStripe("user-1")).rejects.toThrow(
      "collection",
    );
  });

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
        ui_mode: "elements",
        currency: "eur",
        adaptive_pricing: { enabled: false },
        allow_promotion_codes: true,
        line_items: [{ price: "price_basic_plus", quantity: 1 }],
        client_reference_id: "user-1",
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reuses elements checkout, expires other sessions and routes subscribers to local settings", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_open",
          metadata: { anthonPlan: "basic" },
          ui_mode: "elements",
          client_secret: "cs_existing_secret",
          livemode: false,
        },
      ],
      has_more: false,
    });
    expect(await createStripeCheckout("user-1", "basic")).toEqual({
      clientSecret: "cs_existing_secret",
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    await createStripeCheckout("user-1", "basic_plus");
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    expect(await createStripeCheckout("user-1", "basic")).toEqual({
      url: "/profile?tab=billing",
    });
  });

  it("expires hosted sessions even for the selected plan", async () => {
    mocks.checkoutList.mockResolvedValue({
      has_more: false,
      data: [
        {
          id: "cs_hosted",
          ui_mode: "hosted",
          metadata: { anthonPlan: "basic" },
          url: "https://checkout.stripe.com/old",
          livemode: false,
        },
      ],
    });
    expect(await createStripeCheckout("user-1", "basic")).toEqual({
      clientSecret: "cs_test_secret",
    });
    expect(mocks.expire).toHaveBeenCalledWith("cs_hosted");
  });

  it("summarizes only the account's subscription, card and invoices without changing access", async () => {
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    mocks.invoices.mockResolvedValue({
      data: [
        {
          id: "in_paid",
          customer: "cus_user",
          livemode: false,
          number: "001",
          created: 123,
          total: 1499,
          currency: "eur",
          status: "paid",
          invoice_pdf: "https://pay.stripe.com/invoice.pdf",
        },
      ],
    });
    expect(await getStripeBillingSummary("user-1")).toEqual({
      subscription: {
        plan: "basic",
        name: "Basic",
        amount: 1999,
        currency: "eur",
        status: "active",
        interval: "month",
        currentPeriodEnd: 4102444800,
        cancelAtPeriodEnd: false,
      },
      paymentMethod: {
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
      },
      invoices: [
        {
          id: "in_paid",
          number: "001",
          date: 123,
          amount: 1499,
          currency: "eur",
          status: "paid",
          downloadUrl: "https://pay.stripe.com/invoice.pdf",
        },
      ],
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
  });

  it("schedules and resumes renewal without revoking paid access or prorating", async () => {
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    await setStripeCancellation("user-1", true);
    expect(mocks.updateSubscription).toHaveBeenLastCalledWith("sub_paid", {
      cancel_at_period_end: true,
      proration_behavior: "none",
    });
    await setStripeCancellation("user-1", false);
    expect(mocks.updateSubscription).toHaveBeenLastCalledWith("sub_paid", {
      cancel_at_period_end: false,
      proration_behavior: "none",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.subscriptions.mockResolvedValue({
      data: [{ ...activeSubscription, status: "canceled" }],
      has_more: false,
    });
    await expect(setStripeCancellation("user-1", false)).rejects.toThrow(
      "renewable",
    );
  });

  it("uses an owned successful setup intent for both future invoice defaults", async () => {
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    expect(await createStripePaymentMethodSetup("user-1")).toEqual({
      clientSecret: "seti_secret",
    });
    expect(mocks.setupCreate).toHaveBeenCalledWith({
      customer: "cus_user",
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { anthonUserId: "user-1" },
    });
    await confirmStripePaymentMethod("user-1", "seti_owned");
    expect(mocks.updateCustomer).toHaveBeenCalledWith("cus_user", {
      invoice_settings: { default_payment_method: "pm_card" },
    });
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_paid", {
      default_payment_method: "pm_card",
      proration_behavior: "none",
    });
  });

  it("returns an empty summary without creating a customer and cannot resume expired paid time", async () => {
    mocks.findSubscription.mockResolvedValueOnce(null);
    expect(await getStripeBillingSummary("user-1")).toEqual({
      subscription: null,
      paymentMethod: null,
      invoices: [],
    });
    expect(mocks.customers).not.toHaveBeenCalled();
    mocks.subscriptions.mockResolvedValue({
      data: [
        {
          ...activeSubscription,
          items: {
            data: [
              { ...activeSubscription.items.data[0], current_period_end: 1 },
            ],
          },
        },
      ],
      has_more: false,
    });
    await expect(setStripeCancellation("user-1", false)).rejects.toThrow(
      "renewable",
    );
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });

  it("fails closed for foreign or multiple subscriptions and can retry a partial card-default update", async () => {
    mocks.subscriptions.mockResolvedValueOnce({
      data: [{ ...activeSubscription, customer: "cus_victim" }],
      has_more: false,
    });
    await expect(setStripeCancellation("user-1", true)).rejects.toThrow(
      "Unexpected personal subscription",
    );
    mocks.subscriptions.mockResolvedValueOnce({
      data: [
        activeSubscription,
        { ...activeSubscription, id: "sub_duplicate" },
      ],
      has_more: false,
    });
    await expect(setStripeCancellation("user-1", true)).rejects.toThrow(
      "Multiple personal subscriptions",
    );
    mocks.subscriptions.mockResolvedValue({
      data: [activeSubscription],
      has_more: false,
    });
    mocks.updateSubscription.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    await expect(
      confirmStripePaymentMethod("user-1", "seti_owned"),
    ).rejects.toThrow("Network unavailable");
    await expect(
      confirmStripePaymentMethod("user-1", "seti_owned"),
    ).resolves.toBeUndefined();
    expect(mocks.updateCustomer).toHaveBeenCalledTimes(2);
  });

  it("rejects foreign, incomplete and live setup intents and detached payment methods", async () => {
    for (const override of [
      { customer: "cus_victim" },
      { status: "requires_payment_method" },
      { livemode: true },
      { metadata: { anthonUserId: "victim" } },
    ]) {
      mocks.setupRetrieve.mockResolvedValueOnce({
        customer: "cus_user",
        status: "succeeded",
        livemode: false,
        payment_method: "pm_card",
        metadata: { anthonUserId: "user-1" },
        ...override,
      });
      await expect(
        confirmStripePaymentMethod("user-1", "seti_untrusted"),
      ).rejects.toThrow("setup intent");
    }
    mocks.paymentMethod.mockResolvedValueOnce({
      customer: null,
      livemode: false,
      type: "card",
    });
    await expect(
      confirmStripePaymentMethod("user-1", "seti_owned"),
    ).rejects.toThrow("payment method ownership");
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
    mocks.retrieveCustomer.mockResolvedValueOnce({
      id: "cus_user",
      livemode: false,
      metadata: { anthonUserId: "victim" },
    });
    await expect(getStripeBillingSummary("user-1")).rejects.toThrow(
      "customer ownership",
    );
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
    ).rejects.toThrow("billing mode");
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
