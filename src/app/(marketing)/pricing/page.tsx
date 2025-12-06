import { PricingTable } from "@clerk/nextjs";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
            Scegli il piano giusto per te
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Inizia gratis e scala quando sei pronto. Nessun impegno richiesto.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <PricingTable />
        </div>
      </div>
    </div>
  );
}
