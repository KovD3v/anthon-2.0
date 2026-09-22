import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkout: vi.fn(),
  summary: vi.fn(),
  cancellation: vi.fn(),
  setup: vi.fn(),
  confirm: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.auth }));
vi.mock("@/lib/billing/stripe", () => ({
  createStripeCheckout: mocks.checkout,
  getStripeBillingSummary: mocks.summary,
  setStripeCancellation: mocks.cancellation,
  createStripePaymentMethodSetup: mocks.setup,
  confirmStripePaymentMethod: mocks.confirm,
  syncPersonalSubscriptionFromStripe: mocks.sync,
}));

import { GET, POST } from "./route";

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
  mocks.checkout.mockResolvedValue({ clientSecret: "cs_secret" });
  mocks.summary.mockResolvedValue({
    subscription: null,
    paymentMethod: null,
    invoices: [],
  });
  mocks.setup.mockResolvedValue({ clientSecret: "seti_secret" });
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
    { action: "checkout", plan: "enterprise" },
    { action: "checkout", plan: "basic", amount: 1 },
    { action: "portal", customer: "cus_victim" },
    { action: "refresh", userId: "victim" },
    { action: "cancel", subscriptionId: "sub_victim" },
    { action: "resume", customer: "cus_victim" },
    { action: "setup_payment_method", customer: "cus_victim" },
    {
      action: "confirm_payment_method",
      setupIntentId: "seti_owned",
      paymentMethodId: "pm_victim",
    },
    { action: "confirm_payment_method", setupIntentId: "not-an-intent" },
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

it("returns a private noncached authenticated summary and no portal action", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.summary).toHaveBeenCalledWith("authenticated-user");
  expect((await POST(request({ action: "portal" }))).status).toBe(400);
  mocks.auth.mockResolvedValueOnce({ user: null });
  expect((await GET()).status).toBe(401);
  vi.stubEnv("BILLING_PROVIDER", "clerk");
  expect((await GET()).status).toBe(404);
});

it("dispatches management actions only for the authenticated user", async () => {
  expect(
    await (await POST(request({ action: "checkout", plan: "basic" }))).json(),
  ).toEqual({ clientSecret: "cs_secret" });
  for (const action of ["cancel", "resume"]) {
    expect(await (await POST(request({ action }))).json()).toEqual({
      ok: true,
    });
    expect(mocks.cancellation).toHaveBeenLastCalledWith(
      "authenticated-user",
      action === "cancel",
    );
  }
  expect(
    await (await POST(request({ action: "setup_payment_method" }))).json(),
  ).toEqual({ clientSecret: "seti_secret" });
  expect(
    await (
      await POST(
        request({
          action: "confirm_payment_method",
          setupIntentId: "seti_owned",
        }),
      )
    ).json(),
  ).toEqual({ ok: true });
  expect(mocks.confirm).toHaveBeenCalledWith(
    "authenticated-user",
    "seti_owned",
  );
  mocks.confirm.mockRejectedValueOnce(new Error("Invalid ownership"));
  expect(
    (
      await POST(
        request({
          action: "confirm_payment_method",
          setupIntentId: "seti_foreign",
        }),
      )
    ).status,
  ).toBe(503);
});
