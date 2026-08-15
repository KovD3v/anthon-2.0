"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountConsole } from "../components/AccountConsole";

export function ProfileClient() {
  const router = useRouter();

  const handleBack = () => {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const canReturnToPreviousPage =
      referrer?.origin === window.location.origin &&
      referrer.pathname !== window.location.pathname;

    if (canReturnToPreviousPage) {
      router.back();
    } else {
      router.push("/chat");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav
        aria-label="Navigazione del profilo"
        className="border-b bg-muted/30"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="min-h-11 shrink-0 gap-2 px-2 text-muted-foreground hover:text-foreground sm:px-3"
            aria-label="Torna alla pagina precedente"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sm:hidden">Indietro</span>
            <span className="hidden sm:inline">Torna indietro</span>
          </Button>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <h1 className="min-w-0 truncate text-sm font-medium">
            Profilo e impostazioni
          </h1>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-3 py-7 sm:px-6 sm:py-14">
        <AccountConsole />
      </main>
    </div>
  );
}
