import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStripePlans, validateStripePrice } from "./stripe-catalog";

afterEach(() => vi.unstubAllEnvs());

describe("approved EUR catalog", () => {
  it.each(["stripe_test", "stripe_live"])(
    "validates all six offers in %s",
    (mode) => {
      vi.stubEnv("BILLING_PROVIDER", mode);
      const plans = getStripePlans();
      expect(Object.values(plans).map((plan) => plan.amount)).toEqual([
        1999, 2999, 4999, 19999, 29999, 49999,
      ]);
      for (const [key, plan] of Object.entries(plans)) {
        const price = {
          active: true,
          livemode: mode === "stripe_live",
          currency: "eur",
          unit_amount: plan.amount,
          lookup_key: plan.lookupKey,
          product: plan.productId,
          recurring: {
            interval: plan.interval,
            interval_count: 1,
            usage_type: "licensed",
          },
          tax_behavior: "inclusive",
        } as Stripe.Price;
        expect(() =>
          validateStripePrice(price, key as keyof typeof plans),
        ).not.toThrow();
        expect(() =>
          validateStripePrice(
            { ...price, livemode: !price.livemode },
            key as keyof typeof plans,
          ),
        ).toThrow();
        expect(() =>
          validateStripePrice(
            { ...price, unit_amount: plan.amount - 1 },
            key as keyof typeof plans,
          ),
        ).toThrow();
      }
      const monthly = Object.values(plans)
        .filter((plan) => plan.interval === "month")
        .map((plan) => plan.productId);
      const annual = Object.values(plans)
        .filter((plan) => plan.interval === "year")
        .map((plan) => plan.productId);
      expect(monthly).toHaveLength(3);
      expect(annual).toHaveLength(3);
      expect(annual.some((product) => monthly.includes(product))).toBe(false);
    },
  );
});
