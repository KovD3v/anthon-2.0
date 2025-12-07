"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

const testimonials = [
  {
    id: "testimonial-sarah",
    quote:
      "Anthon mi ha aiutato a superare l'ansia pre-partita. Non mi sono mai sentito così concentrato e sicuro scendendo in campo.",
    author: "Sarah J.",
    role: "Calciatrice Professionista",
    rating: 5,
  },
  {
    id: "testimonial-michael",
    quote:
      "Gli esercizi di visualizzazione sono una svolta. È come avere uno psicologo dello sport in tasca 24/7.",
    author: "Michael T.",
    role: "Giocatore di Basket Universitario",
    rating: 5,
  },
  {
    id: "testimonial-david",
    quote:
      "Prima crollavo sotto pressione. Anthon mi ha insegnato come resettarmi e rimanere nella zona. Le mie statistiche sono migliorate significativamente.",
    author: "David R.",
    role: "Tennista",
    rating: 5,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1 },
};

export function Testimonials() {
  return (
    <section className="py-16 md:py-24 bg-muted/30" id="testimonials">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl"
          >
            Scelto dagli Atleti
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Scopri come Anthon sta aiutando atleti di diversi sport a
            raggiungere il loro potenziale.
          </motion.p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {testimonials.map((testimonial) => (
            <motion.div key={testimonial.id} variants={item}>
              <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-xl h-full">
                <CardContent className="pt-6">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={`${testimonial.id}-star-${i}`}
                        className="h-4 w-4 fill-primary text-primary"
                      />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-6 italic">
                    "{testimonial.quote}"
                  </p>
                </CardContent>
                <CardFooter className="border-t pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {testimonial.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {testimonial.author}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
