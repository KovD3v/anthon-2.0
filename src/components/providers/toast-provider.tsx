"use client";

import { Toaster } from "@/components/ui/sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      offset={{
        top: "max(24px, env(safe-area-inset-top))",
        right: "24px",
        bottom: "24px",
        left: "24px",
      }}
      mobileOffset={{
        top: "max(16px, env(safe-area-inset-top))",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        left: "max(16px, env(safe-area-inset-left))",
      }}
      richColors
      closeButton
    />
  );
}
