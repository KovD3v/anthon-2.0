import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { getStripeTestOrigin } from "../src/lib/billing/config";
import {
  confirmStripePaymentMethod,
  createStripeCheckout,
  createStripePaymentMethodSetup,
  getStripe,
  getStripeBillingSummary,
  setStripeCancellation,
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
    await stripe.customers.update(customer.id, {
      metadata: { anthonUserId: user.id },
    });
    for (const offer of prices.filter(
      (item) => item.interval === "year" || item.key === "pro",
    )) {
      const result = await createStripeCheckout(user.id, offer.key);
      assert("clientSecret" in result && result.clientSecret);
      const opened = await stripe.checkout.sessions.list({
        customer: customer.id,
        status: "open",
        limit: 10,
      });
      assert.equal(opened.data.length, 1);
      const annualSession = opened.data[0];
      assert.equal(
        annualSession.allow_promotion_codes,
        offer.interval === "month",
      );
      const lines = await stripe.checkout.sessions.listLineItems(
        annualSession.id,
      );
      assert.equal(lines.data[0].price?.unit_amount, offer.price.unit_amount);
      assert.equal(lines.data[0].price?.recurring?.interval, offer.interval);
      await stripe.checkout.sessions.expire(annualSession.id);
    }
    console.log(
      "PASS: Pro monthly and all annual checkout amounts/intervals; annual promotions disabled.",
    );
    const checkout = await createStripeCheckout(user.id, "basic_plus");
    assert(
      "clientSecret" in checkout && checkout.clientSecret,
      "Checkout must return a client secret",
    );
    const sessions = await stripe.checkout.sessions.list({
      customer: customer.id,
      status: "open",
      limit: 10,
    });
    assert.equal(sessions.data.length, 1);
    const session = sessions.data[0];
    assert.equal(session.ui_mode, "elements");
    assert.equal(session.currency, "eur");
    assert.equal(session.customer, customer.id);
    assert.equal(
      session.return_url,
      `${getStripeTestOrigin()}/profile?tab=billing&checkout=complete`,
    );
    // Boolean assertions avoid printing client secrets on a failed comparison.
    assert(
      session.client_secret === checkout.clientSecret,
      "Checkout secret must match its session",
    );
    const reused = await createStripeCheckout(user.id, "basic_plus");
    assert(
      "clientSecret" in reused && reused.clientSecret === checkout.clientSecret,
      "Repeated checkout must reuse the session",
    );
    assert.equal(
      (
        await stripe.checkout.sessions.list({
          customer: customer.id,
          status: "open",
          limit: 10,
        })
      ).data.length,
      1,
    );
    await stripe.checkout.sessions.expire(session.id);
    assert.equal(
      (await stripe.checkout.sessions.retrieve(session.id)).status,
      "expired",
    );
    console.log(
      "PASS: real EUR Elements checkout created, reused and expired for the synthetic customer.",
    );
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

    const summary = await getStripeBillingSummary(user.id);
    assert.deepEqual(summary.subscription, {
      plan: "basic_plus",
      name: "Basic Plus",
      amount: 2999,
      interval: "month",
      currency: "eur",
      status: "active",
      currentPeriodEnd: subscription.items.data[0].current_period_end,
      cancelAtPeriodEnd: false,
    });
    assert.equal(summary.paymentMethod?.brand, "visa");
    assert.equal(summary.paymentMethod.last4, "4242");
    const displayedInvoice = summary.invoices.find(
      (invoice) => invoice.id === firstInvoice.id,
    );
    assert(displayedInvoice);
    assert.equal(displayedInvoice.amount, 2499);
    assert.equal(displayedInvoice.status, "paid");
    assert.equal(displayedInvoice.currency, "eur");
    assert.equal(displayedInvoice.date, firstInvoice.created);

    const setup = await createStripePaymentMethodSetup(user.id);
    const setupIntentId = setup.clientSecret.split("_secret_")[0];
    assert(setupIntentId.startsWith("seti_"));
    const confirmed = await stripe.setupIntents.confirm(setupIntentId, {
      payment_method: "pm_card_mastercard",
    });
    assert.equal(confirmed.status, "succeeded");
    assert.equal(typeof confirmed.payment_method, "string");
    await confirmStripePaymentMethod(user.id, setupIntentId);
    const updatedCustomer = await stripe.customers.retrieve(customer.id);
    assert(!updatedCustomer.deleted);
    assert.equal(
      updatedCustomer.invoice_settings.default_payment_method,
      confirmed.payment_method,
    );
    assert.equal(
      (await stripe.subscriptions.retrieve(subscription.id))
        .default_payment_method,
      confirmed.payment_method,
    );
    assert.equal(
      (await getStripeBillingSummary(user.id)).paymentMethod?.brand,
      "mastercard",
    );

    // This second customer belongs only to this clock and is removed with it.
    const otherCustomer = await stripe.customers.create({
      test_clock: clock.id,
      metadata: { anthon: "billing-verification-foreign" },
    });
    const foreignIntent = await stripe.setupIntents.create({
      customer: otherCustomer.id,
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      confirm: true,
      usage: "off_session",
      metadata: { anthonUserId: user.id },
    });
    assert.equal(foreignIntent.status, "succeeded");
    await assert.rejects(
      confirmStripePaymentMethod(user.id, foreignIntent.id),
      /ownership/,
    );
    assert.equal(
      (await stripe.subscriptions.retrieve(subscription.id))
        .default_payment_method,
      confirmed.payment_method,
    );
    console.log(
      "PASS: settings summary, verified card replacement and foreign SetupIntent rejection.",
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

    await setStripeCancellation(user.id, true);
    assert.equal(
      (await getStripeBillingSummary(user.id)).subscription?.cancelAtPeriodEnd,
      true,
    );
    await setStripeCancellation(user.id, false);
    assert.equal(
      (await getStripeBillingSummary(user.id)).subscription?.cancelAtPeriodEnd,
      false,
    );
    await setStripeCancellation(user.id, true);
    const ending = await stripe.subscriptions.retrieve(subscription.id);
    assert.equal(ending.cancel_at_period_end, true);
    assert.equal(
      (await syncPersonalSubscriptionFromStripe(user.id)).status,
      "ACTIVE",
    );
    await advance(ending.items.data[0].current_period_end + 60);
    await waitForAccess("CANCELED");
    await assert.rejects(setStripeCancellation(user.id, false), /renewable/);
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
