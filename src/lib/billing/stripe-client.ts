"use client";

import { loadStripe } from "@stripe/stripe-js/pure";

let client: ReturnType<typeof loadStripe> | undefined;

export function getStripeTestClient() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key?.startsWith("pk_test_")) return null;
  client ??= loadStripe(key, { locale: "it" });
  return client;
}
