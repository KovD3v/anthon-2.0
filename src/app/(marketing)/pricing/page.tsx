import { PricingTable } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
            Scegli il piano in base al tuo obiettivo sportivo
          </h1>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Inizia in chat, valida la routine mentale e fai upgrade quando hai
            bisogno di piu continuita o lavoro di squadra.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <PricingTable />
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild>
            <Link href="/chat">Inizia in chat</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href="mailto:anthon.chat@gmail.com">Parla con il team</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
