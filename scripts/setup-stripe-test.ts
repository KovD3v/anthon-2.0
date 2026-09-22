import Stripe from "stripe";
import {
  assertStripeTestEnvironment,
  getStripeTestOrigin,
} from "../src/lib/billing/config";
import {
  getStripeTestPrices,
  STRIPE_TEST_PLANS,
  type StripePlanKey,
  validateStripePrice,
} from "../src/lib/billing/stripe-catalog";

assertStripeTestEnvironment();
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_test_"))
  throw new Error("A Stripe test key is required");
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
const metadata = { anthon: "stripe-eur-test" };

// Stable IDs/lookup keys make reruns safe without repricing existing objects.
for (const [planKey, plan] of Object.entries(STRIPE_TEST_PLANS)) {
  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(plan.productId);
  } catch (error) {
    if (
      !(error instanceof Stripe.errors.StripeInvalidRequestError) ||
      error.code !== "resource_missing"
    )
      throw error;
    product = await stripe.products.create(
      { id: plan.productId, name: plan.name, metadata },
      { idempotencyKey: plan.productId },
    );
  }
  if (
    product.livemode ||
    !product.active ||
    product.metadata.anthon !== metadata.anthon
  )
    throw new Error("Unexpected test product");
  const existing = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    limit: 10,
  });
  if (existing.has_more || existing.data.length > 1)
    throw new Error("Ambiguous test price");
  const price =
    existing.data[0] ??
    (await stripe.prices.create(
      {
        product: product.id,
        currency: "eur",
        unit_amount: plan.amount,
        recurring: { interval: "month" },
        tax_behavior: "inclusive",
        lookup_key: plan.lookupKey,
        metadata,
      },
      { idempotencyKey: plan.lookupKey },
    ));
  validateStripePrice(price, planKey as StripePlanKey);
}

const couponId = "anthon_lancio5_eur_test";
const products = Object.values(STRIPE_TEST_PLANS)
  .map((plan) => plan.productId)
  .sort();
let coupon: Stripe.Coupon;
try {
  coupon = await stripe.coupons.retrieve(couponId, { expand: ["applies_to"] });
} catch (error) {
  if (
    !(error instanceof Stripe.errors.StripeInvalidRequestError) ||
    error.code !== "resource_missing"
  )
    throw error;
  coupon = await stripe.coupons.create(
    {
      id: couponId,
      name: "Lancio: 5 € sul primo mese",
      currency: "eur",
      amount_off: 500,
      duration: "once",
      applies_to: { products },
      expand: ["applies_to"],
      metadata,
    },
    { idempotencyKey: couponId },
  );
}
if (
  coupon.livemode ||
  coupon.amount_off !== 500 ||
  coupon.currency !== "eur" ||
  coupon.duration !== "once" ||
  JSON.stringify(coupon.applies_to?.products.toSorted()) !==
    JSON.stringify(products)
)
  throw new Error("Unexpected launch coupon; no changes made to it");

const codes = await stripe.promotionCodes.list({ code: "LANCIO5", limit: 100 });
if (codes.has_more || codes.data.length > 1)
  throw new Error("Ambiguous launch code");
const promotion =
  codes.data[0] ??
  (await stripe.promotionCodes.create({
    code: "LANCIO5",
    promotion: { type: "coupon", coupon: coupon.id },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    restrictions: { first_time_transaction: true },
    metadata,
  }));
const promotionCoupon = promotion.promotion.coupon;
if (
  promotion.livemode ||
  !promotion.restrictions.first_time_transaction ||
  (typeof promotionCoupon === "string"
    ? promotionCoupon
    : promotionCoupon?.id) !== coupon.id ||
  !promotion.expires_at ||
  promotion.expires_at - promotion.created > 30 * 24 * 60 * 60 + 60
)
  throw new Error("Unexpected launch code; no changes made to it");

const configurations = await stripe.billingPortal.configurations.list({
  limit: 100,
});
if (configurations.has_more) throw new Error("Too many portal configurations");
const matches = configurations.data.filter(
  (item) => item.metadata?.anthon === metadata.anthon,
);
if (matches.length > 1) throw new Error("Ambiguous test portal");
const portal =
  matches[0] ??
  (await stripe.billingPortal.configurations.create(
    {
      name: "Anthon EUR test",
      business_profile: { headline: "Anthon · gestione abbonamento di test" },
      default_return_url: `${getStripeTestOrigin()}/pricing`,
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["email", "name", "address"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          proration_behavior: "none",
        },
        subscription_update: { enabled: false },
      },
      metadata,
    },
    { idempotencyKey: "anthon-eur-test-portal" },
  ));
if (
  portal.livemode ||
  !portal.active ||
  !portal.features.subscription_cancel.enabled ||
  portal.features.subscription_cancel.mode !== "at_period_end"
)
  throw new Error("Unexpected test portal");

const prices = await getStripeTestPrices(stripe);
console.log(
  JSON.stringify(
    {
      mode: "test",
      prices: prices.map(({ name, price }) => ({
        name,
        currency: price.currency,
        amount: price.unit_amount,
        interval: price.recurring?.interval,
        id: price.id,
      })),
      promotion: {
        code: promotion.code,
        amountOff: coupon.amount_off,
        currency: coupon.currency,
        duration: coupon.duration,
        firstTimeOnly: promotion.restrictions.first_time_transaction,
        active: promotion.active,
        expiresAt: new Date(promotion.expires_at * 1000).toISOString(),
      },
      portal: portal.id,
    },
    null,
    2,
  ),
);
