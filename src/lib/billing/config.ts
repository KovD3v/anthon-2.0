export function isStripeTestBilling(): boolean {
  return process.env.BILLING_PROVIDER === "stripe_test";
}

export function isStripeLiveBilling(): boolean {
  return process.env.BILLING_PROVIDER === "stripe_live";
}

export function isStripeBilling(): boolean {
  return isStripeTestBilling() || isStripeLiveBilling();
}

export function assertStripeEnvironment(): void {
  if (!isStripeLiveBilling()) {
    assertStripeTestEnvironment();
    return;
  }
  if (
    process.env.VERCEL_ENV !== "production" ||
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") ||
    !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ||
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")
  ) {
    throw new Error(
      "Stripe live billing requires production and live credentials",
    );
  }
  const url = new URL(process.env.APP_URL ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Stripe live billing requires a public HTTPS APP_URL");
  }
}

export function getStripeOrigin(): string {
  assertStripeEnvironment();
  return isStripeLiveBilling()
    ? new URL(process.env.APP_URL as string).origin
    : getStripeTestOrigin();
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
