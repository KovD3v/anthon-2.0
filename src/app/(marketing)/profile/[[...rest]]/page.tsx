"use client";

import { UserProfile } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PreferencesSection } from "../components/PreferencesSection";

export default function ProfilePage() {
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
      {/* Contextual navigation */}
      <nav
        aria-label="Navigazione del profilo"
        className="border-b bg-muted/30"
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2 text-muted-foreground hover:text-foreground"
            aria-label="Torna alla pagina precedente"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna indietro
          </Button>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <h1 className="text-sm font-medium">Profilo e impostazioni</h1>
        </div>
      </nav>

      {/* Profile Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        {/* Clerk UserProfile */}
        <div className="flex justify-center">
          <UserProfile
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "shadow-none",
              },
            }}
          />
        </div>

        {/* Preferences Section */}
        <PreferencesSection />
      </div>
    </div>
  );
}
