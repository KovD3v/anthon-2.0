import "server-only";
import Stripe from "stripe";
import type { SubscriptionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { assertStripeTestEnvironment, getStripeTestOrigin } from "./config";
import type { StripeBillingSummary } from "./contracts";
import {
  getStripeTestPrices,
  STRIPE_TEST_PLANS,
  type StripePlanKey,
} from "./stripe-catalog";

export function getStripe(): Stripe {
  assertStripeTestEnvironment();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a test key");
  }
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 10_000 });
}

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function withUserLock<T>(
  userId: string,
  run: (tx: Transaction) => Promise<T>,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stripe:${userId}`}))`;
      return run(tx);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

async function getCustomer(
  stripe: Stripe,
  tx: Transaction,
  userId: string,
): Promise<string> {
  const current = await tx.subscription.findUnique({ where: { userId } });
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.isGuest || user.deletedAt)
    throw new Error("User cannot subscribe");
  if (current?.stripeCustomerId) return current.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      metadata: { anthonUserId: userId },
    },
    { idempotencyKey: `anthon-test-customer:${userId}` },
  );
  if (customer.livemode) throw new Error("Live customer rejected");
  await tx.subscription.upsert({
    where: { userId },
    create: { userId, stripeCustomerId: customer.id },
    update: {
      stripeCustomerId: customer.id,
      status: "EXPIRED",
      planId: null,
      clerkSubscriptionId: null,
    },
  });
  return customer.id;
}

async function subscriptionsForCustomer(stripe: Stripe, customer: string) {
  const result = await stripe.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });
  // Fail closed instead of overlooking an active subscription on another page.
  if (result.has_more || result.data.some((item) => item.livemode)) {
    throw new Error("Unexpected Stripe subscription collection");
  }
  return result.data;
}

export async function createStripeCheckout(
  userId: string,
  plan: StripePlanKey,
) {
  const stripe = getStripe();
  const origin = getStripeTestOrigin();
  const prices = await getStripeTestPrices(stripe);
  const selected = prices.find((entry) => entry.key === plan);
  if (!selected) throw new Error("Unknown plan");
  return withUserLock(userId, async (tx) => {
    const customer = await getCustomer(stripe, tx, userId);
    const subscriptions = await subscriptionsForCustomer(stripe, customer);
    if (
      subscriptions.some(
        (item) => !["canceled", "incomplete_expired"].includes(item.status),
      )
    ) {
      return { url: "/profile?tab=billing" };
    }
    const open = await stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 100,
    });
    if (open.has_more) throw new Error("Too many open checkouts");
    if (open.data.some((session) => session.livemode))
      throw new Error("Live checkout rejected");
    const pending = open.data.find(
      (session) =>
        session.metadata?.anthonPlan === plan &&
        session.ui_mode === "elements" &&
        session.client_secret,
    );
    // One open checkout per account prevents parallel purchases of two plans.
    for (const session of open.data) {
      if (session.id === pending?.id) continue;
      await stripe.checkout.sessions.expire(session.id);
    }
    if (pending?.client_secret) return { clientSecret: pending.client_secret };
    const checkout = await stripe.checkout.sessions.create({
      customer,
      mode: "subscription",
      ui_mode: "elements",
      currency: "eur",
      adaptive_pricing: { enabled: false },
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: [{ price: selected.price.id, quantity: 1 }],
      metadata: { anthonPlan: plan },
      subscription_data: { metadata: { anthonUserId: userId } },
      client_reference_id: userId,
      locale: "it",
      return_url: `${origin}/profile?tab=billing&checkout=complete`,
    });
    if (!checkout.client_secret || checkout.livemode)
      throw new Error("Invalid test checkout");
    return { clientSecret: checkout.client_secret };
  });
}

async function ownedCustomer(stripe: Stripe, tx: Transaction, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.isGuest || user.deletedAt)
    throw new Error("Invalid billing account");
  const current = await tx.subscription.findUnique({ where: { userId } });
  if (!current?.stripeCustomerId) return null;
  const customer = await stripe.customers.retrieve(current.stripeCustomerId);
  if (
    customer.deleted ||
    customer.livemode ||
    customer.metadata.anthonUserId !== userId
  )
    throw new Error("Invalid billing customer ownership");
  return customer;
}

async function personalSubscription(stripe: Stripe, customer: string) {
  const prices = await getStripeTestPrices(stripe);
  const subscriptions = await subscriptionsForCustomer(stripe, customer);
  const ongoing = subscriptions.filter(
    (item) => !["canceled", "incomplete_expired"].includes(item.status),
  );
  if (ongoing.length > 1) throw new Error("Multiple personal subscriptions");
  const subscription =
    ongoing[0] ?? subscriptions.sort((a, b) => b.created - a.created)[0];
  if (!subscription) return null;
  const selected = prices.find(
    ({ price }) => price.id === subscription.items.data[0]?.price.id,
  );
  if (
    !selected ||
    subscription.items.data.length !== 1 ||
    subscription.items.data[0].quantity !== 1 ||
    subscription.customer !== customer
  )
    throw new Error("Unexpected personal subscription");
  return { subscription, selected };
}

export async function getStripeBillingSummary(
  userId: string,
): Promise<StripeBillingSummary> {
  const stripe = getStripe();
  const customer = await ownedCustomer(stripe, prisma, userId);
  if (!customer)
    return { subscription: null, paymentMethod: null, invoices: [] };
  const personal = await personalSubscription(stripe, customer.id);
  const method =
    personal?.subscription.default_payment_method ??
    customer.invoice_settings.default_payment_method;
  const paymentMethod =
    typeof method === "string"
      ? await stripe.paymentMethods.retrieve(method)
      : method;
  if (
    paymentMethod &&
    (paymentMethod.livemode || paymentMethod.customer !== customer.id)
  )
    throw new Error("Invalid payment method ownership");
  // ponytail: latest 12 invoices; paginate when longer history is needed.
  const invoices = await stripe.invoices.list({
    customer: customer.id,
    limit: 12,
  });
  if (
    invoices.data.some(
      (invoice) => invoice.livemode || invoice.customer !== customer.id,
    )
  )
    throw new Error("Invalid invoice ownership");
  const card = paymentMethod?.card;
  return {
    subscription: personal
      ? {
          plan: personal.selected.key,
          name: STRIPE_TEST_PLANS[personal.selected.key].name,
          amount: STRIPE_TEST_PLANS[personal.selected.key].amount,
          currency: "eur",
          status: personal.subscription.status,
          currentPeriodEnd:
            personal.subscription.items.data[0].current_period_end,
          cancelAtPeriodEnd: personal.subscription.cancel_at_period_end,
        }
      : null,
    paymentMethod: card
      ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        }
      : null,
    invoices: invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      date: invoice.created,
      amount: invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      downloadUrl: invoice.invoice_pdf ?? null,
    })),
  };
}

export async function setStripeCancellation(userId: string, cancel: boolean) {
  const stripe = getStripe();
  await withUserLock(userId, async (tx) => {
    const customer = await ownedCustomer(stripe, tx, userId);
    if (!customer) throw new Error("No billing customer");
    const personal = await personalSubscription(stripe, customer.id);
    if (
      !personal ||
      !["active", "past_due"].includes(personal.subscription.status) ||
      (!cancel &&
        personal.subscription.items.data[0].current_period_end <=
          Math.floor(Date.now() / 1000))
    )
      throw new Error("No renewable subscription");
    await stripe.subscriptions.update(personal.subscription.id, {
      cancel_at_period_end: cancel,
      proration_behavior: "none",
    });
  });
}

export async function createStripePaymentMethodSetup(userId: string) {
  const stripe = getStripe();
  return withUserLock(userId, async (tx) => {
    const customer = await ownedCustomer(stripe, tx, userId);
    if (!customer) throw new Error("No billing customer");
    const intent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { anthonUserId: userId },
    });
    if (intent.livemode || !intent.client_secret)
      throw new Error("Invalid setup intent");
    return { clientSecret: intent.client_secret };
  });
}

export async function confirmStripePaymentMethod(
  userId: string,
  setupIntentId: string,
) {
  const stripe = getStripe();
  await withUserLock(userId, async (tx) => {
    const customer = await ownedCustomer(stripe, tx, userId);
    if (!customer) throw new Error("No billing customer");
    const intent = await stripe.setupIntents.retrieve(setupIntentId);
    if (
      intent.livemode ||
      intent.status !== "succeeded" ||
      intent.customer !== customer.id ||
      intent.metadata?.anthonUserId !== userId ||
      typeof intent.payment_method !== "string"
    )
      throw new Error("Invalid setup intent ownership or state");
    const method = await stripe.paymentMethods.retrieve(intent.payment_method);
    if (
      method.livemode ||
      method.customer !== customer.id ||
      method.type !== "card"
    )
      throw new Error("Invalid payment method ownership");
    const personal = await personalSubscription(stripe, customer.id);
    // Both writes are idempotent: retry after either request fails.
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: method.id },
    });
    if (
      personal &&
      !["canceled", "incomplete_expired"].includes(personal.subscription.status)
    )
      await stripe.subscriptions.update(personal.subscription.id, {
        default_payment_method: method.id,
        proration_behavior: "none",
      });
  });
}

export function stripeSubscriptionState(
  subscription: Stripe.Subscription | undefined,
) {
  let status: SubscriptionStatus = "EXPIRED";
  if (subscription?.status === "active") status = "ACTIVE";
  if (subscription?.status === "past_due") status = "PAST_DUE";
  if (subscription?.status === "canceled") status = "CANCELED";
  return status;
}

export async function syncPersonalSubscriptionFromStripe(userId: string) {
  const stripe = getStripe();
  const prices = await getStripeTestPrices(stripe);
  return withUserLock(userId, async (tx) => {
    const current = await tx.subscription.findUnique({ where: { userId } });
    if (!current?.stripeCustomerId) {
      if (current)
        await tx.subscription.update({
          where: { userId },
          data: { status: "EXPIRED", planId: null },
        });
      return { status: "EXPIRED" as const, planId: null };
    }
    const subscriptions = await subscriptionsForCustomer(
      stripe,
      current.stripeCustomerId,
    );
    const relevant = subscriptions.filter(
      (item) =>
        item.items.data.length === 1 &&
        item.items.data[0].quantity === 1 &&
        prices.some(({ price }) => price.id === item.items.data[0].price.id),
    );
    const active = relevant.filter((item) => item.status === "active");
    if (active.length > 1)
      throw new Error("Multiple active personal subscriptions");
    const subscription =
      active[0] ?? relevant.sort((a, b) => b.created - a.created)[0];
    const selected = prices.find(
      ({ price }) => price.id === subscription?.items.data[0]?.price.id,
    );
    const status = stripeSubscriptionState(subscription);
    const planId = selected ? `stripe_test:${selected.key}` : null;
    await tx.subscription.update({
      where: { userId },
      data: {
        status,
        planId,
        planName: selected ? STRIPE_TEST_PLANS[selected.key].name : null,
        clerkSubscriptionId: null,
        stripeSubscriptionId: subscription?.id ?? null,
        convertedAt:
          status === "ACTIVE" && current.status !== "ACTIVE"
            ? new Date()
            : undefined,
        canceledAt: status === "CANCELED" ? new Date() : null,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { billingSyncedAt: new Date() },
    });
    return { status, planId };
  });
}

export async function handleStripeEvent(event: Stripe.Event) {
  if (event.livemode || event.account)
    throw new Error("Only standalone test events are accepted");
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "invoice.paid",
      "invoice.payment_failed",
    ].includes(event.type)
  )
    return;
  const object = event.data.object as {
    customer?: string | { id: string } | null;
  };
  const customer =
    typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customer) throw new Error("Missing event customer");
  const current = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customer },
  });
  if (!current) return;
  // Read the current Stripe state under the user lock, never replay stale event data.
  await syncPersonalSubscriptionFromStripe(current.userId);
}

export async function withStripeAccountDeletion(
  userId: string,
  deleteAccount: () => Promise<void>,
) {
  const stripe = getStripe();
  await withUserLock(userId, async (tx) => {
    const current = await tx.subscription.findUnique({ where: { userId } });
    if (!current?.stripeCustomerId) return deleteAccount();
    const open = await stripe.checkout.sessions.list({
      customer: current.stripeCustomerId,
      status: "open",
      limit: 100,
    });
    if (open.has_more)
      throw new Error("Too many pending checkouts to delete account");
    for (const checkout of open.data) {
      if (checkout.livemode) throw new Error("Live checkout rejected");
      await stripe.checkout.sessions.expire(checkout.id);
    }
    for (const subscription of await subscriptionsForCustomer(
      stripe,
      current.stripeCustomerId,
    )) {
      if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
        await stripe.subscriptions.cancel(subscription.id, {
          prorate: false,
          invoice_now: false,
        });
      }
    }
    // Keep checkout creation locked until the identity and customer mapping are gone.
    await deleteAccount();
  });
}
