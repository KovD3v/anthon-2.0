"use client";

import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachingContextSection } from "./CoachingContextSection";
import { ConnectedAccountsSection } from "./ConnectedAccountsSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { PreferencesSection } from "./PreferencesSection";
import { ProfileIdentitySection } from "./ProfileIdentitySection";
import { SecuritySection } from "./SecuritySection";
import { SessionsSection } from "./SessionsSection";
import { UsageSection } from "./UsageSection";

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

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.primaryEmailAddress?.emailAddress ||
    "Account Anthon";
  const primaryEmail = user.primaryEmailAddress?.emailAddress;
  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join("")
      .toUpperCase() ||
    primaryEmail?.[0]?.toUpperCase() ||
    "A";

  return (
    <section aria-label="Account e impostazioni Anthon">
      <header className="flex flex-col gap-7 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.88] tracking-[-0.025em] sm:text-6xl">
            Il tuo{" "}
            <span className="relative isolate inline-block px-[0.04em]">
              <span className="relative z-10">profilo</span>
              <span
                aria-hidden="true"
                className="absolute -inset-x-[0.02em] bottom-[0.04em] -z-10 h-[0.28em] -rotate-[0.8deg] bg-brand-yellow"
              />
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Il tuo account, il modo in cui Anthon risponde e ciò che ricorda di
            te.
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3 sm:max-w-64 sm:justify-end">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-yellow font-display text-lg font-bold text-[#171714]">
            {user.hasImage ? (
              <div
                role="img"
                aria-label="Immagine del profilo"
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url("${user.imageUrl}")` }}
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {primaryEmail ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {primaryEmail}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs defaultValue="profile" className="mt-7 w-full flex-col">
        <TabsList
          aria-label="Sezioni del profilo"
          className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-[#171714] p-1.5 text-white"
        >
          <TabsTrigger
            value="profile"
            className="min-h-11 flex-none rounded-xl px-4 text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]"
          >
            Profilo
          </TabsTrigger>
          <TabsTrigger
            value="anthon"
            className="min-h-11 flex-none rounded-xl px-4 text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]"
          >
            Anthon
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="min-h-11 flex-none rounded-xl px-4 text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]"
          >
            Sicurezza
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="min-h-11 flex-none rounded-xl px-4 text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]"
          >
            Sessioni
          </TabsTrigger>
          <TabsTrigger
            value="connected"
            className="min-h-11 flex-none rounded-xl px-4 text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]"
          >
            Account collegati
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="profile"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card inert:hidden"
        >
          <section aria-label="Profilo account">
            <ProfileIdentitySection user={user} />
            <UsageSection />
            <CoachingContextSection />
            <DangerZoneSection />
          </section>
        </TabsContent>

        <TabsContent
          value="anthon"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card inert:hidden"
        >
          <section aria-label="Impostazioni Anthon">
            <PreferencesSection />
          </section>
        </TabsContent>

        <TabsContent
          value="security"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card inert:hidden"
        >
          <section aria-label="Sicurezza account">
            <SecuritySection />
          </section>
        </TabsContent>

        <TabsContent
          value="sessions"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card inert:hidden"
        >
          <section aria-label="Sessioni attive">
            <SessionsSection />
          </section>
        </TabsContent>

        <TabsContent
          value="connected"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-card inert:hidden"
        >
          <section aria-label="Account collegati">
            <ConnectedAccountsSection />
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
