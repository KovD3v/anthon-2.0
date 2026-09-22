"use client";

import {
  CheckoutElementsProvider,
  ContactDetailsElement,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StripePlanKey } from "@/lib/billing/stripe-catalog";
import { getStripeTestClient } from "@/lib/billing/stripe-client";

type Plan = {
  key: StripePlanKey;
  name: string;
  amount: number;
  interval: "month" | "year";
};
const euros = (amount: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    amount / 100,
  );
const returnPath = "/profile?tab=billing&checkout=complete";

export function CheckoutClient({
  plan,
  testMode,
}: {
  plan: Plan;
  testMode: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [stripe] = useState(getStripeTestClient);
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed session request.
  useEffect(() => {
    if (!stripe) return;
    let active = true;
    setError("");
    async function load() {
      try {
        if (!(await stripe))
          throw new Error("Impossibile caricare il pagamento. Riprova.");
        const response = await fetch("/api/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "checkout", plan: plan.key }),
        });
        const result = await response.json();
        if (!active) return;
        if (!response.ok)
          throw new Error(
            result.error ?? "Impossibile aprire il checkout. Riprova.",
          );
        if (result.url === "/profile?tab=billing") {
          router.replace(result.url);
          return;
        }
        if (typeof result.clientSecret !== "string" || !result.clientSecret)
          throw new Error("Checkout non disponibile. Riprova.");
        setClientSecret(result.clientSecret);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossibile aprire il checkout. Riprova.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [stripe, plan.key, router, attempt]);

  if (!stripe)
    return (
      <p role="alert">
        Il pagamento non è ancora configurato. Torna ai piani e riprova più
        tardi.
      </p>
    );
  if (error)
    return (
      <div>
        <p role="alert" className="mb-4">
          {error}
        </p>
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Riprova
        </Button>
      </div>
    );
  if (!clientSecret) return <output>Preparazione del pagamento…</output>;
  return (
    <CheckoutElementsProvider
      stripe={stripe}
      options={{
        clientSecret,
        adaptivePricing: { allowed: false },
        elementsOptions: {
          appearance: {
            theme: resolvedTheme === "dark" ? "night" : "stripe",
            variables: {
              colorPrimary: resolvedTheme === "dark" ? "#d9e34b" : "#9b841d",
              colorBackground: resolvedTheme === "dark" ? "#171714" : "#ffffff",
              colorText: resolvedTheme === "dark" ? "#f4f2e9" : "#25251f",
              colorTextSecondary:
                resolvedTheme === "dark" ? "#bcbbae" : "#656458",
              borderRadius: "6px",
            },
          },
        },
      }}
    >
      <CheckoutForm plan={plan} testMode={testMode} />
    </CheckoutElementsProvider>
  );
}

export function CheckoutForm({
  plan,
  testMode,
}: {
  plan: Plan;
  testMode: boolean;
}) {
  const state = useCheckoutElements();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"payment" | "discount" | null>(null);
  const [error, setError] = useState("");
  if (state.type === "loading")
    return <output>Caricamento del modulo di pagamento…</output>;
  if (state.type === "error")
    return <p role="alert">{state.error.message} Torna ai piani e riprova.</p>;
  const { checkout } = state;
  if (checkout.livemode !== !testMode || checkout.currency !== "eur")
    return (
      <p role="alert">Questo checkout non è disponibile in questo ambiente.</p>
    );

  async function discount(remove = false) {
    setPending("discount");
    setError("");
    try {
      const result = remove
        ? await checkout.removePromotionCode()
        : await checkout.applyPromotionCode(code.trim());
      if (result.type === "error") setError(result.error.message);
      else setCode("");
    } catch {
      setError("Impossibile aggiornare lo sconto. Riprova.");
    } finally {
      setPending(null);
    }
  }

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending("payment");
    setError("");
    try {
      const result = await checkout.confirm({
        redirect: "if_required",
        returnUrl: `${window.location.origin}${returnPath}`,
      });
      if (result.type === "error") {
        setError(result.error.message);
        setPending(null);
      } else {
        router.replace(returnPath);
        router.refresh();
      }
    } catch {
      setError("Pagamento non confermato. Verifica i dati e riprova.");
      setPending(null);
    }
  }

  return (
    <div className="grid items-start gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
      <section aria-label="Riepilogo ordine" className="min-w-0">
        <h2 className="font-display text-3xl font-bold uppercase">
          {plan.name}
        </h2>
        <p className="mt-3 text-xl">
          {euros(plan.amount)}{" "}
          <span className="text-sm text-muted-foreground">
            {plan.interval === "year" ? "all’anno" : "al mese"}
          </span>
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {plan.interval === "year"
            ? "Addebito annuale anticipato e rinnovo annuale automatico."
            : "Rinnovo mensile automatico."}{" "}
          Puoi disdire il rinnovo dalle impostazioni del tuo abbonamento.
        </p>
        <dl className="mt-8 space-y-4 border-y border-border py-6 text-sm">
          {checkout.discountAmounts?.map((discount) => (
            <div
              key={discount.promotionCode ?? discount.displayName}
              className="flex flex-wrap justify-between gap-2"
            >
              <dt>Sconto {discount.promotionCode ?? discount.displayName}</dt>
              <dd>−{discount.amount}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 text-lg font-semibold">
            <dt>Totale oggi</dt>
            <dd aria-live="polite">{checkout.total.total.amount}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>
              {plan.interval === "year"
                ? "Dal prossimo anno"
                : "Dal prossimo mese"}
            </dt>
            <dd>
              {checkout.recurring?.dueNext.total.amount ?? euros(plan.amount)}
            </dd>
          </div>
        </dl>
        {plan.interval === "month" && (
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void discount();
            }}
          >
            <label htmlFor="promotion-code" className="text-sm font-medium">
              Codice promozionale
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="promotion-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoCapitalize="characters"
                disabled={pending !== null}
                className="min-h-11"
              />
              <Button
                variant="outline"
                type="submit"
                disabled={pending !== null || !code.trim()}
              >
                Applica
              </Button>
            </div>
            {checkout.discountAmounts?.some((item) => item.promotionCode) && (
              <Button
                type="button"
                variant="ghost"
                className="mt-2"
                disabled={pending !== null}
                onClick={() => void discount(true)}
              >
                Rimuovi codice
              </Button>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              LANCIO5: 5 € di sconto sul primo mese per i nuovi abbonati entro
              30 giorni dal lancio. Esclusi i piani annuali.
            </p>
          </form>
        )}
      </section>
      <form onSubmit={pay} className="min-w-0 space-y-6" aria-label="Pagamento">
        <h2 className="text-xl font-semibold">Dati di pagamento</h2>
        <ContactDetailsElement />
        <PaymentElement options={{ layout: "tabs" }} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Confermando accetti i{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Termini di servizio
          </Link>
          . Leggi l’
          <Link href="/privacy" className="underline underline-offset-4">
            informativa privacy
          </Link>
          .
        </p>
        <Button
          type="submit"
          className="min-h-12 w-full"
          disabled={pending !== null || !checkout.canConfirm}
        >
          {pending === "payment"
            ? "Conferma in corso…"
            : `Abbonati · ${checkout.total.total.amount}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {testMode
            ? "Pagamento di test elaborato da Stripe."
            : "Pagamento elaborato da Stripe."}
        </p>
      </form>
    </div>
  );
}
