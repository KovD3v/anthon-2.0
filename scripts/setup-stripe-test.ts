import Stripe from "stripe";
import { assertStripeEnvironment } from "../src/lib/billing/config";
import {
  getStripePlans,
  getStripeTestPrices,
  type StripePlanKey,
  validateStripePrice,
} from "../src/lib/billing/stripe-catalog";

assertStripeEnvironment();
const live = process.env.BILLING_PROVIDER === "stripe_live";
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith(live ? "sk_live_" : "sk_test_"))
  throw new Error("Stripe key does not match billing mode");
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
const metadata = { anthon: live ? "stripe-eur-live" : "stripe-eur-test" };
const plans = getStripePlans();
const launchAt = process.env.STRIPE_LAUNCH_AT;
if (live && (!launchAt || !Number.isFinite(Date.parse(launchAt))))
  throw new Error("STRIPE_LAUNCH_AT must be the approved ISO launch date");
const expiresAt =
  Math.floor((launchAt ? Date.parse(launchAt) : Date.now()) / 1000) +
  30 * 24 * 60 * 60;
if (expiresAt <= Math.floor(Date.now() / 1000))
  throw new Error("Launch promotion window has already ended");

// Stable IDs/lookup keys make reruns safe without repricing existing objects.
for (const [planKey, plan] of Object.entries(plans)) {
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
      { idempotencyKey: `product:${plan.productId}` },
    );
  }
  if (
    product.livemode !== live ||
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
        recurring: { interval: plan.interval },
        tax_behavior: "inclusive",
        lookup_key: plan.lookupKey,
        metadata,
      },
      { idempotencyKey: `price:${plan.lookupKey}` },
    ));
  validateStripePrice(price, planKey as StripePlanKey);
}

const couponId = `anthon_lancio5_eur_${live ? "live" : "test"}_monthly_v2`;
const products = Object.values(plans)
  .filter((plan) => plan.interval === "month")
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
  coupon.livemode !== live ||
  coupon.amount_off !== 500 ||
  coupon.currency !== "eur" ||
  coupon.duration !== "once" ||
  JSON.stringify(coupon.applies_to?.products.toSorted()) !==
    JSON.stringify(products)
)
  throw new Error("Unexpected launch coupon; no changes made to it");

const codes = await stripe.promotionCodes.list({
  code: "LANCIO5",
  active: true,
  limit: 100,
});
if (codes.has_more || codes.data.length > 1)
  throw new Error("Ambiguous launch code");
let existingPromotion: Stripe.PromotionCode | undefined = codes.data[0];
if (existingPromotion) {
  const old = existingPromotion.promotion.coupon;
  const oldId = typeof old === "string" ? old : old?.id;
  // Replace only our previous Sandbox campaign; never overwrite an unknown live code.
  if (!live && oldId === "anthon_lancio5_eur_test") {
    await stripe.promotionCodes.update(existingPromotion.id, { active: false });
    existingPromotion = undefined;
  }
}
const promotion =
  existingPromotion ??
  (await stripe.promotionCodes.create({
    code: "LANCIO5",
    promotion: { type: "coupon", coupon: coupon.id },
    expires_at: expiresAt,
    restrictions: { first_time_transaction: true },
    metadata,
  }));
const promotionCoupon = promotion.promotion.coupon;
if (
  promotion.livemode !== live ||
  !promotion.restrictions.first_time_transaction ||
  (typeof promotionCoupon === "string"
    ? promotionCoupon
    : promotionCoupon?.id) !== coupon.id ||
  !promotion.expires_at ||
  (live && promotion.expires_at !== expiresAt)
)
  throw new Error("Unexpected launch code; no changes made to it");

const prices = await getStripeTestPrices(stripe);
console.log(
  JSON.stringify(
    {
      mode: live ? "live" : "test",
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
    },
    null,
    2,
  ),
);
