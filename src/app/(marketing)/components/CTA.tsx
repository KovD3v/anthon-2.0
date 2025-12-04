"use client";

import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="py-16 md:py-24 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-6">
            Pronto a elevare il tuo gioco?
          </h2>
          <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            Unisciti a migliaia di atleti che stanno allenando la loro mente per
            vincere. Inizia oggi la tua prova gratuita.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <SignedOut>
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  variant="secondary"
                  className="text-primary font-bold"
                >
                  Inizia gratis
                </Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Button
                size="lg"
                variant="secondary"
                className="text-primary font-bold"
                asChild
              >
                <Link href="/chat">Vai alla chat</Link>
              </Button>
            </SignedIn>
            <Button
              size="lg"
              variant="outline"
              className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10"
              asChild
            >
              <a href="mailto:anthon.chat@gmail.com">Contatta le vendite</a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
