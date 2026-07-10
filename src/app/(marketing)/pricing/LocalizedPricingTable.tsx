"use client";

import { PricingTable } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PricingSkeleton } from "./PricingSkeleton";

export function LocalizedPricingTable() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const detectPricingTable = () => {
      if (container.querySelector("button")) {
        setIsReady(true);
      }
    };

    detectPricingTable();
    const observer = new MutationObserver(detectPricingTable);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-[28rem]">
      {!isReady && <PricingSkeleton />}
      <div
        className={cn(
          "transition-opacity duration-300",
          isReady ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!isReady}
      >
        <PricingTable
          appearance={{
            variables: {
              colorPrimary: "#d0aa00",
              colorBackground: "#f8f5eb",
              colorForeground: "#1b1b17",
              colorMutedForeground: "#5f5d54",
              borderRadius: "0.9rem",
            },
            elements: {
              pricingTable: "gap-4",
              pricingTableCard:
                "border border-border shadow-none overflow-hidden",
              pricingTableCardHeader: "p-5 sm:p-6",
              pricingTableCardTitle:
                "font-display uppercase text-2xl tracking-tight",
              pricingTableCardDescription: "text-sm leading-relaxed",
              pricingTableCardFee: "font-display text-4xl font-bold",
              pricingTableCardFeePeriod: "text-sm",
              pricingTableCardPeriodToggle: "mt-4",
              pricingTableCardFeaturesListItemContent:
                "text-sm leading-relaxed",
              pricingTableCardFooterButton:
                "min-h-11 font-semibold shadow-none",
            },
          }}
        />
      </div>
    </div>
  );
}
