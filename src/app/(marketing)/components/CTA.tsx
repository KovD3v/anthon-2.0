"use client";

import { m } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { defaultTransition, scaleIn } from "@/lib/motion";

export function CTA() {
  return (
    <section className="bg-primary py-16 text-primary-foreground md:py-24">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <m.div
          variants={scaleIn}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          transition={defaultTransition}
        >
          <h2 className="font-display mx-auto mb-6 max-w-4xl text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
            Porta fiducia, focus e lucidità nella tua prossima gara
          </h2>
          <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            Parti dalla chat, scegli il piano quando ti serve più continuità e
            coinvolgi il team quando lavori con atleti o staff.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="gap-2 bg-[#171714] font-bold text-[#f8f5eb] hover:bg-[#252520]"
              asChild
            >
              <Link href="/chat">
                Inizia in chat <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              asChild
            >
              <Link href="/pricing">Confronta i piani</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              asChild
            >
              <a href="mailto:anthon.chat@gmail.com">Contatta il team</a>
            </Button>
          </div>
        </m.div>
      </div>
    </section>
  );
}
