import type Stripe from "stripe";

// Annual offers use separate products so launch coupons cannot discount them.
export const STRIPE_TEST_PLANS = {
  basic: {
    name: "Basic",
    amount: 1999,
    interval: "month",
    lookupKey: "anthon_basic_eur_monthly_test",
    productId: "anthon_basic_eur_test",
  },
  basic_plus: {
    name: "Basic Plus",
    amount: 2999,
    interval: "month",
    lookupKey: "anthon_basic_plus_eur_monthly_test",
    productId: "anthon_basic_plus_eur_test",
  },
  pro: {
    name: "Pro",
    amount: 4999,
    interval: "month",
    lookupKey: "anthon_pro_eur_monthly_test",
    productId: "anthon_pro_eur_test",
  },
  basic_annual: {
    name: "Basic",
    amount: 19999,
    interval: "year",
    lookupKey: "anthon_basic_eur_annual_test",
    productId: "anthon_basic_eur_annual_test",
  },
  basic_plus_annual: {
    name: "Basic Plus",
    amount: 29999,
    interval: "year",
    lookupKey: "anthon_basic_plus_eur_annual_test",
    productId: "anthon_basic_plus_eur_annual_test",
  },
  pro_annual: {
    name: "Pro",
    amount: 49999,
    interval: "year",
    lookupKey: "anthon_pro_eur_annual_test",
    productId: "anthon_pro_eur_annual_test",
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_TEST_PLANS;

export function getStripePlans() {
  const live = process.env.BILLING_PROVIDER === "stripe_live";
  return Object.fromEntries(
    Object.entries(STRIPE_TEST_PLANS).map(([key, plan]) => [
      key,
      {
        ...plan,
        lookupKey: live
          ? plan.lookupKey.replace(/_test$/, "_live")
          : plan.lookupKey,
        productId: live
          ? plan.productId.replace(/_test$/, "_live")
          : plan.productId,
      },
    ]),
  ) as Record<
    StripePlanKey,
    {
      name: string;
      amount: number;
      interval: "month" | "year";
      lookupKey: string;
      productId: string;
    }
  >;
}

export function validateStripePrice(
  price: Stripe.Price,
  plan: StripePlanKey,
): void {
  const expected = getStripePlans()[plan];
  if (
    price.livemode !== (process.env.BILLING_PROVIDER === "stripe_live") ||
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== expected.amount ||
    price.lookup_key !== expected.lookupKey ||
    (typeof price.product === "string" ? price.product : price.product.id) !==
      expected.productId ||
    price.recurring?.interval !== expected.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.tax_behavior !== "inclusive"
  ) {
    throw new Error(`Invalid EUR test price for ${plan}`);
  }
}

export async function getStripeTestPrices(stripe: Stripe) {
  const plans = getStripePlans();
  const result = await stripe.prices.list({
    active: true,
    lookup_keys: Object.values(plans).map((plan) => plan.lookupKey),
    limit: 10,
  });
  return Object.entries(plans).map(([key, plan]) => {
    const matches = result.data.filter(
      (price) => price.lookup_key === plan.lookupKey,
    );
    if (matches.length !== 1)
      throw new Error(`Missing or ambiguous Stripe price: ${key}`);
    const price = matches[0];
    validateStripePrice(price, key as StripePlanKey);
    return {
      key: key as StripePlanKey,
      name: plan.name,
      interval: plan.interval,
      price,
    };
  });
}
