import type Stripe from "stripe";

// Only the approved monthly offers are available in the test rollout.
export const STRIPE_TEST_PLANS = {
  basic: {
    name: "Basic",
    amount: 1999,
    lookupKey: "anthon_basic_eur_monthly_test",
    productId: "anthon_basic_eur_test",
  },
  basic_plus: {
    name: "Basic Plus",
    amount: 2999,
    lookupKey: "anthon_basic_plus_eur_monthly_test",
    productId: "anthon_basic_plus_eur_test",
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_TEST_PLANS;

export function validateStripePrice(
  price: Stripe.Price,
  plan: StripePlanKey,
): void {
  if (
    price.livemode ||
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== STRIPE_TEST_PLANS[plan].amount ||
    price.lookup_key !== STRIPE_TEST_PLANS[plan].lookupKey ||
    (typeof price.product === "string" ? price.product : price.product.id) !==
      STRIPE_TEST_PLANS[plan].productId ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.tax_behavior !== "inclusive"
  ) {
    throw new Error(`Invalid EUR test price for ${plan}`);
  }
}

export async function getStripeTestPrices(stripe: Stripe) {
  const result = await stripe.prices.list({
    active: true,
    lookup_keys: Object.values(STRIPE_TEST_PLANS).map((plan) => plan.lookupKey),
    limit: 10,
  });
  return Object.entries(STRIPE_TEST_PLANS).map(([key, plan]) => {
    const matches = result.data.filter(
      (price) => price.lookup_key === plan.lookupKey,
    );
    if (matches.length !== 1)
      throw new Error(`Missing or ambiguous Stripe price: ${key}`);
    const price = matches[0];
    validateStripePrice(price, key as StripePlanKey);
    return { key: key as StripePlanKey, name: plan.name, price };
  });
}
