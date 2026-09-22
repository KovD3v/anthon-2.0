import { Info } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { isStripeTestBilling } from "@/lib/billing/config";
import { LocalizedPricingTable } from "./LocalizedPricingTable";
import { StripePricing } from "./StripePricing";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function PricingPage() {
  const stripeTest = isStripeTestBilling();
  return (
    <PageWrapper>
      <div className="min-h-screen bg-background py-12 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 text-center">
            <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-primary">
              Piani personali
            </p>
            <h1 className="font-display mx-auto mt-4 max-w-4xl text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl">
              Scegli il piano in base al tuo obiettivo sportivo
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {stripeTest
                ? "Prova il pagamento e la gestione dell’abbonamento in ambiente di test. Pro e piani annuali non sono ancora disponibili."
                : "Prova Anthon in chat. Puoi cambiare piano quando vuoi allenarti con più continuità o coinvolgere la squadra."}
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            {stripeTest ? (
              <Suspense
                fallback={<output>Caricamento listino in euro…</output>}
              >
                <StripePricing />
              </Suspense>
            ) : (
              <LocalizedPricingTable />
            )}
            {!stripeTest && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-left text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Con la fatturazione annuale, il prezzo mostrato è
                  l’equivalente mensile; l’addebito viene effettuato una volta
                  all’anno.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild>
              <Link href="/chat">Inizia in chat</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="mailto:anthon.chat@gmail.com">Parla con il team</Link>
            </Button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
