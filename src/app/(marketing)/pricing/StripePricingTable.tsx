"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { StripePlanKey } from "@/lib/billing/stripe-catalog";

export interface StripePriceCard {
  key: StripePlanKey;
  name: string;
  amount: number;
  interval: "month" | "year";
  features: string[];
}

export function StripePricingTable({
  plans,
  testMode,
}: {
  plans: StripePriceCard[];
  testMode: boolean;
}) {
  const { isSignedIn, isLoaded } = useUser();
  const [interval, setInterval] = useState<"month" | "year">("month");

  return (
    <section aria-label="Abbonamenti in euro">
      {testMode && (
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Ambiente di test. Nessun addebito reale.
        </p>
      )}
      <fieldset
        className="mb-6 flex justify-center gap-2"
        aria-label="Frequenza di pagamento"
      >
        <Button
          variant={interval === "month" ? "default" : "outline"}
          aria-pressed={interval === "month"}
          onClick={() => setInterval("month")}
        >
          Mensile
        </Button>
        <Button
          variant={interval === "year" ? "default" : "outline"}
          aria-pressed={interval === "year"}
          onClick={() => setInterval("year")}
        >
          Annuale
        </Button>
      </fieldset>
      <div className="grid gap-6 md:grid-cols-3">
        {plans
          .filter((plan) => plan.interval === interval)
          .map((plan) => (
            <article
              key={plan.key}
              className="flex flex-col rounded-xl border border-border bg-card p-6 sm:p-8"
            >
              <h2 className="font-display text-3xl font-bold uppercase">
                {plan.name}
              </h2>
              <p className="mt-4">
                <span className="font-display text-4xl font-bold">
                  {new Intl.NumberFormat("it-IT", {
                    style: "currency",
                    currency: "EUR",
                  }).format(plan.amount / 100)}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {interval === "year" ? "all’anno" : "al mese"}
                </span>
              </p>
              {interval === "year" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Un unico addebito annuale anticipato.
                </p>
              )}
              <ul className="my-6 grow space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {isSignedIn ? (
                <Button asChild className="min-h-11 w-full">
                  <Link href={`/checkout?plan=${plan.key}`}>
                    {`${testMode ? "Prova" : "Scegli"} ${plan.name}`}
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  className="min-h-11 w-full"
                  disabled={!isLoaded}
                >
                  <Link
                    href={`/sign-in?redirect_url=${encodeURIComponent(`/checkout?plan=${plan.key}`)}`}
                  >
                    {`Accedi per ${testMode ? "provare" : "scegliere"} ${plan.name}`}
                  </Link>
                </Button>
              )}
            </article>
          ))}
      </div>
      {interval === "month" && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          LANCIO5: 5 € di sconto sul primo mese per i nuovi abbonati entro 30
          giorni dal lancio. Dal secondo mese si applica il prezzo pieno.
          Esclusi i piani annuali.
        </p>
      )}
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
