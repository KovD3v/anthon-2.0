import { connection } from "next/server";
import { isStripeTestBilling } from "@/lib/billing/config";
import { getStripe } from "@/lib/billing/stripe";
import { getStripeTestPrices } from "@/lib/billing/stripe-catalog";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import { StripePricingTable } from "./StripePricingTable";

export async function StripePricing() {
  await connection();
  try {
    const prices = await getStripeTestPrices(getStripe());
    const plans = prices.map(({ key, name, price, interval }) => {
      const plan =
        PLAN_CATALOG[
          key.startsWith("basic_plus")
            ? "BASIC_PLUS"
            : key.startsWith("pro")
              ? "PRO"
              : "BASIC"
        ];
      return {
        key,
        name,
        amount: price.unit_amount as number,
        interval,
        features: [
          `${plan.limits.maxRequestsPerDay} messaggi al giorno`,
          `Fino a ${plan.voice.maxPerWindow} risposte vocali ogni 12 ore`,
          `Contesto fino a ${plan.limits.maxContextMessages} messaggi`,
          `${plan.uploadLimits.maxUploadsPerDay} allegati al giorno`,
          `Allegati conservati per ${plan.attachmentRetentionDays} giorni`,
        ],
      };
    });
    return (
      <StripePricingTable plans={plans} testMode={isStripeTestBilling()} />
    );
  } catch {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <h2 className="text-xl font-semibold">Il listino non è disponibile</h2>
        <p className="mt-3 text-muted-foreground">
          Non è possibile caricare i piani in questo momento. Riprova più tardi.
        </p>
      </div>
    );
  }
}
