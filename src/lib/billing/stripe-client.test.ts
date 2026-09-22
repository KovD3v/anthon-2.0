import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadStripe = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe }));

beforeEach(() => loadStripe.mockResolvedValue({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  loadStripe.mockClear();
});

describe("Stripe test browser client", () => {
  it.each(["", "pk_live_forbidden", "sk_test_forbidden"])(
    "does not load Stripe with an absent or invalid public key: %s",
    async (key) => {
      vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", key);
      const { getStripeTestClient } = await import("./stripe-client");
      expect(getStripeTestClient()).toBeNull();
      expect(loadStripe).not.toHaveBeenCalled();
    },
  );

  it("loads the Italian payment client once, only on demand", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_example");
    const { getStripeTestClient } = await import("./stripe-client");
    expect(loadStripe).not.toHaveBeenCalled();
    expect(getStripeTestClient()).toBe(getStripeTestClient());
    expect(loadStripe).toHaveBeenCalledExactlyOnceWith("pk_test_example", {
      locale: "it",
    });
  });
});
