"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

/**
 * Custom hook wrapping @tanstack/react-virtual's useVirtualizer.
 * The "use no memo" directive opts this hook out of React Compiler
 * memoization to avoid stale-UI issues with the virtualizer API.
 */
export function useMessageVirtualizer(count: number) {
  "use no memo";
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  return { parentRef, rowVirtualizer };
}
