export function isStripeTestBilling(): boolean {
  return process.env.BILLING_PROVIDER === "stripe_test";
}

export function assertStripeTestEnvironment(): void {
  if (!isStripeTestBilling() || process.env.VERCEL_ENV === "production") {
    throw new Error("Stripe billing is restricted to the test environment");
  }
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Stripe test billing requires Clerk test credentials");
  }
}

export function getStripeTestDatabaseUrl(direct = false): string {
  assertStripeTestEnvironment();
  const value = direct
    ? process.env.STRIPE_TEST_DIRECT_DATABASE_URL
    : process.env.STRIPE_TEST_DATABASE_URL;
  if (!value) throw new Error("A dedicated Stripe test database is required");
  const host = new URL(value).hostname.replace("-pooler", "");
  for (const existing of [
    process.env.DATABASE_URL,
    process.env.DIRECT_DATABASE_URL,
  ]) {
    if (
      existing &&
      new URL(existing).hostname.replace("-pooler", "") === host
    ) {
      throw new Error(
        "Stripe tests must not use the existing database endpoint",
      );
    }
  }
  return value;
}

export function getStripeTestOrigin(): string {
  assertStripeTestEnvironment();
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!local &&
      (process.env.VERCEL_ENV !== "preview" || url.protocol !== "https:"))
  ) {
    throw new Error(
      "Stripe test checkout requires localhost or a preview deployment",
    );
  }
  return url.origin;
}
