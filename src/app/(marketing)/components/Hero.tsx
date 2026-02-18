"use client";

import { motion } from "framer-motion";
import { ArrowRight, Brain, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pt-16 md:pt-20 lg:pt-32 pb-16 md:pb-20 lg:pb-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="info" className="gap-1">
              <Trophy className="h-3 w-3" />
              <span>Mental coaching per sportivi</span>
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-extrabold tracking-tight lg:text-6xl max-w-4xl"
          >
            Più fiducia nei momenti decisivi,{" "}
            <br className="hidden sm:inline" />
            <span className="text-primary">più focus quando conta</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Anthon ti aiuta a gestire pressione, distrazioni e cali mentali con
            routine pratiche prima, durante e dopo gara.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
          >
            <Button size="lg" className="gap-2" asChild>
              <Link href="/chat">
                Inizia in chat <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">Vedi i piani</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-12 relative w-full max-w-5xl mx-auto"
          >
            <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent z-10" />
            <div className="rounded-xl border border-white/10 bg-background/60 backdrop-blur-xl p-2 shadow-2xl">
              <div className="rounded-lg bg-muted/50 aspect-video flex items-center justify-center overflow-hidden">
                {/* Placeholder for a dashboard image or demo video */}
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <Brain className="h-16 w-16 opacity-20" />
                  <p>Anteprima Dashboard</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
