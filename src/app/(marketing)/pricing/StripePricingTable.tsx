"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { StripePlanKey } from "@/lib/billing/stripe-catalog";

export interface StripePriceCard {
  key: StripePlanKey;
  name: string;
  amount: number;
  features: string[];
}

export function StripePricingTable({ plans }: { plans: StripePriceCard[] }) {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <section aria-label="Abbonamenti in euro, ambiente di test">
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Ambiente di test. Nessun addebito reale. Prezzi mensili in euro.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <article
            key={plan.key}
            className="flex flex-col rounded-xl border border-border bg-card p-6 sm:p-8"
          >
            <h2 className="font-display text-3xl font-bold uppercase">
              {plan.name}
            </h2>
            <p className="mt-4">
              <span className="font-display text-5xl font-bold">
                {new Intl.NumberFormat("it-IT", {
                  style: "currency",
                  currency: "EUR",
                }).format(plan.amount / 100)}
              </span>
              <span className="ml-2 text-muted-foreground">al mese</span>
            </p>
            <ul className="my-6 grow space-y-3 text-sm">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {isSignedIn ? (
              <Button asChild className="min-h-11 w-full">
                <Link href={`/checkout?plan=${plan.key}`}>
                  Prova {plan.name}
                </Link>
              </Button>
            ) : (
              <Button asChild className="min-h-11 w-full" disabled={!isLoaded}>
                <Link
                  href={`/sign-in?redirect_url=${encodeURIComponent(`/checkout?plan=${plan.key}`)}`}
                >
                  Accedi per provare {plan.name}
                </Link>
              </Button>
            )}
          </article>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Inserisci LANCIO5 nel checkout per provare lo sconto di 5 € sul primo
        mese. Dal secondo mese si applica il prezzo pieno. Solo nuovi clienti,
        entro la scadenza del codice.
      </p>
      {isSignedIn && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/profile?tab=billing">Gestisci abbonamento</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
