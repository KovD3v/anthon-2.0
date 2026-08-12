"use client";

import { m } from "framer-motion";
import { defaultTransition, fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function PageWrapper({
  children,
  className,
  motion = true,
}: {
  children: React.ReactNode;
  className?: string;
  motion?: boolean;
}) {
  return (
    <m.div
      variants={motion ? fadeIn : undefined}
      initial={motion ? "hidden" : false}
      animate="show"
      transition={motion ? defaultTransition : undefined}
      className={cn(className)}
    >
      {children}
    </m.div>
  );
}
