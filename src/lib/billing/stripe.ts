import "server-only";
import Stripe from "stripe";
import type { SubscriptionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { assertStripeTestEnvironment, getStripeTestOrigin } from "./config";
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

async function portalUrl(stripe: Stripe, customer: string): Promise<string> {
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const configuration = configurations.data.find(
    (item) => item.metadata?.anthon === "stripe-eur-test",
  );
  if (!configuration || configuration.livemode)
    throw new Error("Stripe test portal is not configured");
  const portal = await stripe.billingPortal.sessions.create({
    customer,
    configuration: configuration.id,
    return_url: `${getStripeTestOrigin()}/pricing`,
    locale: "it",
  });
  return portal.url;
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
      return portalUrl(stripe, customer);
    }
    const open = await stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 100,
    });
    if (open.has_more) throw new Error("Too many open checkouts");
    const pending = open.data.find(
      (session) => session.metadata?.anthonPlan === plan,
    );
    if (pending?.url && !pending.livemode) return pending.url;
    // One open checkout per account prevents parallel purchases of two plans.
    for (const session of open.data) {
      if (session.livemode) throw new Error("Live checkout rejected");
      await stripe.checkout.sessions.expire(session.id);
    }
    const checkout = await stripe.checkout.sessions.create({
      customer,
      mode: "subscription",
      currency: "eur",
      adaptive_pricing: { enabled: false },
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: [{ price: selected.price.id, quantity: 1 }],
      metadata: { anthonPlan: plan },
      subscription_data: { metadata: { anthonUserId: userId } },
      client_reference_id: userId,
      locale: "it",
      success_url: `${origin}/pricing?checkout=complete`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    });
    if (!checkout.url || checkout.livemode)
      throw new Error("Invalid test checkout");
    return checkout.url;
  });
}

export async function createStripePortal(userId: string) {
  const stripe = getStripe();
  const current = await prisma.subscription.findUnique({ where: { userId } });
  if (!current?.stripeCustomerId)
    throw new Error("No Stripe customer for this account");
  return portalUrl(stripe, current.stripeCustomerId);
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
