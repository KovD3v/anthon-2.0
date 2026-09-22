import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.auth }));
vi.mock("@/lib/billing/stripe", () => ({
  createStripeCheckout: mocks.checkout,
  createStripePortal: mocks.portal,
  syncPersonalSubscriptionFromStripe: mocks.sync,
}));

import { POST } from "./route";

function request(body: unknown, origin = "http://localhost:3005") {
  return new Request(`${origin}/api/billing`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "stripe_test");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("APP_URL", "http://localhost:3005");
  mocks.auth.mockResolvedValue({
    user: { id: "authenticated-user", isGuest: false },
  });
  mocks.checkout.mockResolvedValue("https://checkout.stripe.com/test");
});
afterEach(() => vi.unstubAllEnvs());

it("requires authentication, same origin and an approved plan with no client overrides", async () => {
  expect(
    (
      await POST(
        request(
          { action: "checkout", plan: "basic" },
          "https://attacker.example",
        ),
      )
    ).status,
  ).toBe(403);
  mocks.auth.mockResolvedValueOnce({ user: null });
  expect(
    (await POST(request({ action: "checkout", plan: "basic" }))).status,
  ).toBe(401);
  for (const body of [
    { action: "checkout", plan: "pro" },
    { action: "checkout", plan: "basic", amount: 1 },
    { action: "portal", customer: "cus_victim" },
    { action: "refresh", userId: "victim" },
  ]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(mocks.checkout).not.toHaveBeenCalled();
  expect(
    (await POST(request({ action: "checkout", plan: "basic" }))).status,
  ).toBe(200);
  expect(mocks.checkout).toHaveBeenCalledWith("authenticated-user", "basic");
  vi.stubEnv("BILLING_PROVIDER", "clerk");
  expect(
    (await POST(request({ action: "checkout", plan: "basic" }))).status,
  ).toBe(404);
});
