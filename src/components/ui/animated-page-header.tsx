"use client";

import { m } from "framer-motion";
import { fadeUp, defaultTransition } from "@/lib/motion";

interface AnimatedPageHeaderProps {
  title: string;
  description?: string;
}

export function AnimatedPageHeader({ title, description }: AnimatedPageHeaderProps) {
  return (
    <m.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={defaultTransition}
    >
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}
    </m.div>
  );
}
