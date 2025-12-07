"use client";

import { UserProfile } from "@clerk/nextjs";
import { ArrowLeft, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const router = useRouter();

  const handleBack = () => {
    // Try to go back to previous page, fallback to home
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb Navigation */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Torna indietro
            </Button>
            <span className="text-muted-foreground">/</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Home className="h-4 w-4" />
              Home
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">Profilo</span>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="flex items-center justify-center py-12">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-none",
            },
          }}
        />
      </div>
    </div>
  );
}
