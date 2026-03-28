"use client";

import { m } from "framer-motion";
import { staggerContainer, fadeUp, defaultTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedGridProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}

export function AnimatedGrid({ children, className, stagger = 0.08 }: AnimatedGridProps) {
  return (
    <m.div
      variants={staggerContainer(stagger)}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </m.div>
  );
}

export function AnimatedGridItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div
      variants={fadeUp}
      transition={defaultTransition}
      className={className}
    >
      {children}
    </m.div>
  );
}
