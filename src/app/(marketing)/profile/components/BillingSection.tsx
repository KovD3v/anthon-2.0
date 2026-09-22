"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { StripeBillingSummary } from "@/lib/billing/contracts";
import { getStripeTestClient } from "@/lib/billing/stripe-client";

const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
    amount / 100,
  );
const statusLabels: Record<string, string> = {
  active: "Attivo",
  trialing: "Periodo di prova",
  past_due: "Pagamento da aggiornare",
  unpaid: "Pagamento non riuscito",
  canceled: "Terminato",
  incomplete: "Pagamento da completare",
  incomplete_expired: "Pagamento scaduto",
  paused: "In pausa",
  paid: "Pagata",
  open: "Da pagare",
  draft: "In preparazione",
  void: "Annullata",
  uncollectible: "Non riscossa",
};

async function billingAction(body: Record<string, string>) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error("Operazione non riuscita. Riprova tra qualche istante.");
  return response.json();
}

function PaymentMethodForm({
  onSaved,
  onCancel,
}: {
  onSaved: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmedIntentId, setConfirmedIntentId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-5 max-w-lg space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stripe || !elements || saving) return;
        setSaving(true);
        setError(null);
        try {
          let setupIntentId = confirmedIntentId;
          if (!setupIntentId) {
            const result = await stripe.confirmSetup({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/profile?tab=billing`,
              },
              redirect: "if_required",
            });
            if (result.error)
              throw new Error(
                result.error.message || "Impossibile salvare la carta.",
              );
            if (result.setupIntent.status !== "succeeded")
              throw new Error("La carta non è ancora confermata. Riprova.");
            setupIntentId = result.setupIntent.id;
            setConfirmedIntentId(setupIntentId);
          }
          await onSaved(setupIntentId);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossibile salvare la carta. Riprova.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      {!confirmedIntentId ? (
        <PaymentElement
          onReady={() => setReady(true)}
          onLoadError={() =>
            setError(
              "Impossibile caricare il modulo della carta. Chiudilo e riprova.",
            )
          }
        />
      ) : null}
      <p className="text-sm text-muted-foreground">
        La nuova carta sarà utilizzata per i prossimi rinnovi. Non verrà
        addebitato alcun importo ora.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={!stripe || !elements || !ready || saving}
        >
          {saving
            ? "Salvataggio…"
            : confirmedIntentId
              ? "Riprova salvataggio"
              : "Salva carta"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}

export function BillingSection() {
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<StripeBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripe] = useState(getStripeTestClient);

  const load = useCallback(async () => {
    const response = await fetch("/api/billing", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Impossibile caricare l’abbonamento. Riprova.");
    setData(await response.json());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const url = new URL(window.location.href);
      const setupIntentId = url.searchParams.get("setup_intent");
      const clearReturnParams = (keys: string[]) => {
        for (const key of keys) url.searchParams.delete(key);
        window.history.replaceState(null, "", url);
      };
      if (setupIntentId) {
        const redirectStatus = url.searchParams.get("redirect_status");
        if (redirectStatus && redirectStatus !== "succeeded") {
          setError(
            "La verifica della carta non è stata completata. Puoi riprovare con Cambia carta.",
          );
        } else {
          await billingAction({
            action: "confirm_payment_method",
            setupIntentId,
          });
          setNotice("Carta aggiornata.");
        }
        clearReturnParams([
          "setup_intent",
          "setup_intent_client_secret",
          "redirect_status",
        ]);
      }
      if (url.searchParams.get("checkout") === "complete") {
        await billingAction({ action: "refresh" });
        clearReturnParams(["checkout"]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossibile caricare l’abbonamento. Riprova.",
      );
    }
    try {
      await load();
    } catch {
      setError("Impossibile caricare l’abbonamento. Riprova.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateSubscription(action: "cancel" | "resume") {
    setConfirmCancel(false);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await billingAction({ action });
      await load();
      setNotice(
        action === "cancel"
          ? "Rinnovo automatico disattivato."
          : "Rinnovo automatico riattivato.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Operazione non riuscita. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }

  const subscription = data?.subscription;
  const card = data?.paymentMethod;
  const canManage =
    subscription &&
    !["canceled", "incomplete_expired"].includes(subscription.status);
  const canChangeRenewal =
    subscription && ["active", "past_due"].includes(subscription.status);

  return (
    <section aria-label="Abbonamento" aria-busy={loading || busy}>
      <div className="px-5 py-7 sm:px-8 sm:py-8">
        <h2 className="font-display text-[1.75rem] font-bold uppercase leading-none tracking-tight sm:text-3xl">
          Abbonamento
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Piano, rinnovi e fatture del tuo account.
        </p>
        {error ? (
          <div role="alert" className="mt-5 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              disabled={loading || busy}
              onClick={() => void refresh()}
            >
              Riprova
            </Button>
          </div>
        ) : null}
        {notice ? (
          <output className="mt-5 block text-sm">{notice}</output>
        ) : null}
        {loading ? (
          <output className="mt-5 block text-sm text-muted-foreground">
            Caricamento abbonamento…
          </output>
        ) : data ? (
          <div className="mt-6 space-y-5">
            {subscription ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Piano attuale
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">
                      {subscription.name}
                    </h3>
                    <p className="mt-1 text-sm">
                      {money(subscription.amount, subscription.currency)} / mese
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {statusLabels[subscription.status] ?? subscription.status}
                  </p>
                </div>
                {canChangeRenewal ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {subscription.cancelAtPeriodEnd
                        ? `Rinnovo disattivato. Il piano termina il ${date(subscription.currentPeriodEnd)}.`
                        : `Prossimo rinnovo: ${date(subscription.currentPeriodEnd)}.`}
                    </p>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        subscription.cancelAtPeriodEnd
                          ? void updateSubscription("resume")
                          : setConfirmCancel(true)
                      }
                    >
                      {busy
                        ? "Aggiornamento…"
                        : subscription.cancelAtPeriodEnd
                          ? "Riattiva rinnovo"
                          : "Disattiva rinnovo"}
                    </Button>
                  </>
                ) : !canManage ? (
                  <Button asChild variant="outline">
                    <Link href="/pricing">Vedi i piani</Link>
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Non hai un abbonamento personale attivo.
                </p>
                <Button asChild>
                  <Link href="/pricing">Vedi i piani</Link>
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {data && !loading ? (
        <>
          <section
            aria-label="Metodo di pagamento"
            className="border-t border-border/70 px-5 py-7 sm:px-8 sm:py-8"
          >
            <h3 className="font-display text-2xl font-bold uppercase tracking-tight">
              Metodo di pagamento
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              {card
                ? `${card.brand.toUpperCase()} •••• ${card.last4} · Scadenza ${String(card.expMonth).padStart(2, "0")}/${card.expYear}`
                : "Nessuna carta salvata."}
            </p>
            {canManage && !clientSecret ? (
              <Button
                className="mt-5"
                variant="outline"
                disabled={busy || !stripe}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  setNotice(null);
                  try {
                    const result = await billingAction({
                      action: "setup_payment_method",
                    });
                    setClientSecret(result.clientSecret);
                    const url = new URL(window.location.href);
                    for (const key of [
                      "setup_intent",
                      "setup_intent_client_secret",
                      "redirect_status",
                    ])
                      url.searchParams.delete(key);
                    window.history.replaceState(null, "", url);
                  } catch {
                    setError(
                      "Impossibile aprire il modulo della carta. Riprova.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Caricamento…"
                  : card
                    ? "Cambia carta"
                    : "Aggiungi carta"}
              </Button>
            ) : null}
            {canManage && !stripe ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Il cambio carta non è disponibile al momento.
              </p>
            ) : null}
            {clientSecret && stripe ? (
              <Elements
                stripe={stripe}
                options={{
                  clientSecret,
                  locale: "it",
                  appearance: {
                    theme: resolvedTheme === "dark" ? "night" : "stripe",
                    variables: {
                      colorPrimary:
                        resolvedTheme === "dark" ? "#d9e34b" : "#9b841d",
                      colorBackground:
                        resolvedTheme === "dark" ? "#171714" : "#ffffff",
                      colorText:
                        resolvedTheme === "dark" ? "#f5f3e9" : "#1b1b17",
                      colorTextSecondary:
                        resolvedTheme === "dark" ? "#aaa89c" : "#5f5d54",
                      borderRadius: "6px",
                    },
                  },
                }}
              >
                <PaymentMethodForm
                  onCancel={() => setClientSecret(null)}
                  onSaved={async (setupIntentId) => {
                    await billingAction({
                      action: "confirm_payment_method",
                      setupIntentId,
                    });
                    await load();
                    setClientSecret(null);
                    setNotice("Carta aggiornata.");
                  }}
                />
              </Elements>
            ) : null}
          </section>
          <section
            aria-label="Fatture"
            className="border-t border-border/70 px-5 py-7 sm:px-8 sm:py-8"
          >
            <h3 className="font-display text-2xl font-bold uppercase tracking-tight">
              Fatture
            </h3>
            {data.invoices.length ? (
              <ul className="mt-4 divide-y divide-border/70">
                {data.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {invoice.number ?? "Fattura"} · {date(invoice.date)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {money(invoice.amount, invoice.currency)}
                        {invoice.status
                          ? ` · ${statusLabels[invoice.status] ?? invoice.status}`
                          : ""}
                      </p>
                    </div>
                    {invoice.downloadUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={invoice.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Scarica PDF fattura ${invoice.number ?? date(invoice.date)}`}
                        >
                          Scarica PDF
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        PDF non disponibile
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Non ci sono ancora fatture.
              </p>
            )}
          </section>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        onConfirm={() => void updateSubscription("cancel")}
        title="Disattivare il rinnovo?"
        description={`Il piano rimarrà disponibile fino al ${subscription ? date(subscription.currentPeriodEnd) : "termine del periodo pagato"}. Dopo questa data non sarà rinnovato e non riceverai altri addebiti per il rinnovo. Puoi riattivarlo prima della scadenza.`}
        confirmText="Disattiva rinnovo"
        cancelText="Mantieni abbonamento"
      />
    </section>
  );
}
