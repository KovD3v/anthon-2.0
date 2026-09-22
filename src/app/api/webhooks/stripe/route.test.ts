import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@/lib/billing/stripe", async () => {
  const { default: SDK } = await import("stripe");
  return {
    getStripe: () => new SDK("sk_test_fixture"),
    handleStripeEvent: mocks.handle,
  };
});

import { POST } from "./route";

const stripe = new Stripe("sk_test_fixture");
const secret = "whsec_unit_test_only";
function request(live = false, tamper = false) {
  const payload = JSON.stringify({
    id: "evt_test",
    type: "invoice.paid",
    livemode: live,
    data: { object: { customer: "cus_test" } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: tamper ? `${payload} ` : payload,
  });
}
beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "stripe_test");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());

it("verifies the raw signature, rejects live events, and reports failures for Stripe retries", async () => {
  expect((await POST(request(false, true))).status).toBe(400);
  expect((await POST(request(true))).status).toBe(400);
  expect(mocks.handle).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(200);
  expect(mocks.handle).toHaveBeenCalledWith(
    expect.objectContaining({ id: "evt_test" }),
  );
  mocks.handle.mockRejectedValueOnce(new Error("database unavailable"));
  expect((await POST(request())).status).toBe(500);
  vi.stubEnv("BILLING_PROVIDER", "clerk");
  expect((await POST(request())).status).toBe(404);
});
