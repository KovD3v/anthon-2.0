import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { isStripeTestBilling } from "@/lib/billing/config";
import { getStripe } from "@/lib/billing/stripe";
import { getStripeTestPrices } from "@/lib/billing/stripe-catalog";
import { CheckoutClient } from "./CheckoutClient";

export const instant = false;

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  if (!isStripeTestBilling() || process.env.VERCEL_ENV === "production")
    notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-20">
      <Link href="/pricing" className="text-sm underline underline-offset-4">
        Torna ai piani
      </Link>
      <h1 className="mt-6 font-display text-4xl font-bold uppercase sm:text-5xl">
        Attiva il tuo piano
      </h1>
      <p className="mt-3 mb-10 text-sm text-muted-foreground">
        Ambiente di test. Nessun addebito reale.
      </p>
      <Suspense fallback={<output>Caricamento checkout…</output>}>
        <CheckoutContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CheckoutContent({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const { plan } = await searchParams;
  if (plan !== "basic" && plan !== "basic_plus") redirect("/pricing");
  const { userId } = await auth();
  if (!userId)
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/checkout?plan=${plan}`)}`,
    );
  let selected:
    | Awaited<ReturnType<typeof getStripeTestPrices>>[number]
    | undefined;
  try {
    selected = (await getStripeTestPrices(getStripe())).find(
      (item) => item.key === plan,
    );
  } catch {
    return (
      <p role="alert">
        Il checkout di test non è disponibile. Torna ai piani e riprova tra
        poco.
      </p>
    );
  }
  if (!selected) notFound();
  return (
    <CheckoutClient
      key={plan}
      plan={{
        key: selected.key,
        name: selected.name,
        amount: selected.price.unit_amount as number,
      }}
    />
  );
}
