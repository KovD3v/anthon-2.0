"use client";

import { m } from "framer-motion";
import { fadeIn, defaultTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <m.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      transition={defaultTransition}
      className={cn(className)}
    >
      {children}
    </m.div>
  );
}
