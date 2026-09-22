import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import {
  getStripe,
  syncPersonalSubscriptionFromStripe,
  withStripeAccountDeletion,
} from "../src/lib/billing/stripe";
import { getStripeTestPrices } from "../src/lib/billing/stripe-catalog";
import { prisma } from "../src/lib/db";

// Real Stripe sandbox + the isolated DB. Requires dev:stripe-test for webhook delivery.
async function verify() {
  const stripe = getStripe();
  const prices = await getStripeTestPrices(stripe);
  const plus = prices.find((item) => item.key === "basic_plus");
  assert(plus);
  const promotion = (
    await stripe.promotionCodes.list({
      code: "LANCIO5",
      active: true,
      limit: 10,
    })
  ).data[0];
  assert(promotion && !promotion.livemode);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: "Anthon EUR billing verification",
  });
  let userId: string | undefined;
  try {
    const customer = await stripe.customers.create({
      test_clock: clock.id,
      name: "Anthon synthetic billing test",
      metadata: { anthon: "billing-verification" },
    });
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
    const user = await prisma.user.create({
      data: {
        clerkId: `stripe-verification:${clock.id}`,
        subscription: { create: { stripeCustomerId: customer.id } },
      },
    });
    userId = user.id;
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: plus.price.id }],
      discounts: [{ promotion_code: promotion.id }],
      payment_behavior: "error_if_incomplete",
    });
    const firstInvoice = await stripe.invoices.retrieve(
      subscription.latest_invoice as string,
    );
    assert.equal(firstInvoice.currency, "eur");
    assert.equal(firstInvoice.amount_paid, 2499);
    assert.equal(firstInvoice.status, "paid");

    async function waitForAccess(status: string) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const state = await prisma.subscription.findUnique({
          where: { userId: user.id },
        });
        if (
          state?.status === status &&
          state.planId === "stripe_test:basic_plus"
        )
          return;
        await setTimeout(1000);
      }
      throw new Error(`Webhook did not update access to ${status}`);
    }
    async function advance(until: number) {
      await stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: until,
      });
      for (let attempt = 0; attempt < 30; attempt++) {
        if (
          (await stripe.testHelpers.testClocks.retrieve(clock.id)).status ===
          "ready"
        )
          return;
        await setTimeout(1000);
      }
      throw new Error("Stripe test clock did not finish");
    }
    await waitForAccess("ACTIVE");
    console.log(
      "PASS: Basic Plus first invoice EUR 24.99; real signed webhook activated access.",
    );

    await advance(subscription.items.data[0].current_period_end + 4 * 60 * 60);
    const invoices = await stripe.invoices.list({
      subscription: subscription.id,
      limit: 10,
    });
    const renewal = invoices.data.find(
      (invoice) => invoice.billing_reason === "subscription_cycle",
    );
    assert(renewal);
    // Test clocks can leave a freshly generated renewal awaiting the normal finalization delay.
    await advance(
      (await stripe.testHelpers.testClocks.retrieve(clock.id)).frozen_time +
        2 * 60 * 60,
    );
    const paidRenewal = await stripe.invoices.retrieve(renewal.id);
    assert.equal(paidRenewal.currency, "eur");
    assert.equal(paidRenewal.amount_paid, 2999);
    assert.equal(paidRenewal.status, "paid");
    console.log(
      "PASS: automatic renewal EUR 29.99; the EUR 5 discount was not repeated.",
    );

    const ending = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    assert.equal(
      (await syncPersonalSubscriptionFromStripe(user.id)).status,
      "ACTIVE",
    );
    await advance(ending.items.data[0].current_period_end + 60);
    await waitForAccess("CANCELED");
    console.log(
      "PASS: cancellation preserves paid time, then a signed webhook revokes access.",
    );
  } finally {
    if (userId) {
      const createdUserId = userId;
      await withStripeAccountDeletion(createdUserId, async () => {
        await prisma.user.delete({ where: { id: createdUserId } });
      });
    }
    await stripe.testHelpers.testClocks.del(clock.id);
    console.log(
      "Synthetic test account and clock removed; no real accounts deleted.",
    );
    await prisma.$disconnect();
  }
}

verify()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Stripe verification failed",
    );
    process.exit(1);
  });
