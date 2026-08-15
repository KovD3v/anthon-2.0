"use client";

import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachingContextSection } from "./CoachingContextSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { PreferencesSection } from "./PreferencesSection";
import { ProfileIdentitySection } from "./ProfileIdentitySection";
import { SecuritySection } from "./SecuritySection";
import { UsageSection } from "./UsageSection";

function PanelNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-border/70 bg-card/70 p-6 shadow-none">
      <h2 className="font-display text-xl font-bold uppercase tracking-tight">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </Card>
  );
}

export function AccountConsole() {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <Card
        aria-label="Caricamento account"
        className="flex min-h-48 items-center justify-center border-border/70 bg-card/70 shadow-none"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Caricamento account</span>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card
        aria-label="Account non disponibile"
        className="border-border/70 bg-card/70 p-6 shadow-none"
        role="alert"
      >
        <h2 className="font-display text-xl font-bold uppercase tracking-tight">
          Account non disponibile
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Accedi di nuovo per gestire il tuo profilo.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="Account e impostazioni Anthon" className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary">
          Area personale
        </p>
        <h2 className="font-display text-4xl font-bold uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Il tuo profilo
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Gestisci identità, sicurezza e il modo in cui Anthon ti accompagna.
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList
          aria-label="Sezioni del profilo"
          variant="line"
          className="w-full justify-start gap-2 overflow-x-auto rounded-none border-b border-border/70 p-0"
        >
          <TabsTrigger value="profile" className="min-h-11 px-3">
            Profilo
          </TabsTrigger>
          <TabsTrigger value="anthon" className="min-h-11 px-3">
            Anthon
          </TabsTrigger>
          <TabsTrigger value="security" className="min-h-11 px-3">
            Sicurezza
          </TabsTrigger>
          <TabsTrigger value="sessions" className="min-h-11 px-3">
            Sessioni
          </TabsTrigger>
          <TabsTrigger value="connected" className="min-h-11 px-3">
            Account collegati
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <section aria-label="Profilo account" className="space-y-6">
            <ProfileIdentitySection user={user} />
            <UsageSection />
            <CoachingContextSection />
            <DangerZoneSection />
          </section>
        </TabsContent>

        <TabsContent value="anthon" className="mt-6">
          <section aria-label="Impostazioni Anthon">
            <PreferencesSection />
          </section>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <section aria-label="Sicurezza account">
            <SecuritySection />
          </section>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <section aria-label="Sessioni attive">
            <PanelNotice
              title="Sessioni"
              description="Qui potrai controllare i dispositivi che hanno accesso al tuo account."
            />
          </section>
        </TabsContent>

        <TabsContent value="connected" className="mt-6">
          <section aria-label="Account collegati">
            <PanelNotice
              title="Account collegati"
              description="Qui potrai vedere e gestire gli account collegati al tuo accesso."
            />
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
