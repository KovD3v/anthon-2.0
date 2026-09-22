import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadStripe = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe }));

beforeEach(() => loadStripe.mockResolvedValue({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  loadStripe.mockClear();
});

describe("Stripe browser client", () => {
  it.each(["", "pk_invalid_example", "sk_test_forbidden", "sk_live_forbidden"])(
    "does not load Stripe with an absent or invalid public key: %s",
    async (key) => {
      vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", key);
      const { getStripeTestClient } = await import("./stripe-client");
      expect(getStripeTestClient()).toBeNull();
      expect(loadStripe).not.toHaveBeenCalled();
    },
  );

  it.each(["pk_test_example", "pk_live_example"])(
    "loads the Italian payment client once, only on demand: %s",
    async (key) => {
      vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", key);
      const { getStripeTestClient } = await import("./stripe-client");
      expect(loadStripe).not.toHaveBeenCalled();
      expect(getStripeTestClient()).toBe(getStripeTestClient());
      expect(loadStripe).toHaveBeenCalledExactlyOnceWith(key, {
        locale: "it",
      });
    },
  );
});
