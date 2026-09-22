import { connection } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { getStripeTestPrices } from "@/lib/billing/stripe-catalog";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import { StripePricingTable } from "./StripePricingTable";

export async function StripePricing() {
  await connection();
  try {
    const prices = await getStripeTestPrices(getStripe());
    const plans = prices.map(({ key, name, price }) => {
      const plan = PLAN_CATALOG[key === "basic" ? "BASIC" : "BASIC_PLUS"];
      return {
        key,
        name,
        amount: price.unit_amount as number,
        features: [
          `${plan.limits.maxRequestsPerDay} messaggi al giorno`,
          `Fino a ${plan.voice.maxPerWindow} risposte vocali ogni 12 ore`,
          `Contesto fino a ${plan.limits.maxContextMessages} messaggi`,
          `${plan.uploadLimits.maxUploadsPerDay} allegati al giorno`,
          `Allegati conservati per ${plan.attachmentRetentionDays} giorni`,
        ],
      };
    });
    return <StripePricingTable plans={plans} />;
  } catch {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <h2 className="text-xl font-semibold">
          Stripe di test non è ancora collegato
        </h2>
        <p className="mt-3 text-muted-foreground">
          Il checkout in euro sarà disponibile dopo la configurazione delle
          credenziali e del listino di test. Nessun addebito reale è abilitato.
        </p>
      </div>
    );
  }
}
