"use client";

import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useState } from "react";
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

const accountTabs = [
  ["profile", "Profilo"],
  ["anthon", "Anthon"],
  ["security", "Sicurezza"],
  ["sessions", "Sessioni"],
  ["connected", "Account collegati"],
] as const;

export function AccountConsole() {
  const { isLoaded, user } = useUser();
  const [activeTab, setActiveTab] = useState("profile");

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
    <section
      aria-label="Account e impostazioni Anthon"
      className="profile-account-console"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:gap-7 sm:pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-[2.75rem] font-extrabold uppercase leading-[0.88] tracking-[-0.025em] sm:text-6xl">
            Il tuo{" "}
            <span className="relative isolate inline-block px-[0.04em]">
              <span className="relative z-10">profilo</span>
              <span
                aria-hidden="true"
                className="absolute -inset-x-[0.02em] bottom-[0.04em] -z-10 h-[0.28em] -rotate-[0.8deg] bg-brand-yellow"
              />
            </span>
          </h2>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
            Il tuo account, il modo in cui Anthon risponde e ciò che ricorda di
            te.
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3 border-t border-border pt-4 sm:max-w-72 md:justify-end md:border-0 md:pt-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-yellow font-display text-lg font-bold text-[#171714] sm:h-12 sm:w-12">
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
            <p className="truncate text-base font-semibold">{displayName}</p>
            {primaryEmail ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {primaryEmail}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        className="mt-5 w-full flex-col sm:mt-7"
      >
        <TabsList
          aria-label="Sezioni del profilo"
          className="grid h-auto w-full grid-cols-6 gap-1 rounded-xl bg-[#171714] p-1.5 text-white md:flex md:justify-start md:overflow-x-auto md:rounded-2xl"
        >
          {accountTabs.map(([value, label], index) => (
            <TabsTrigger
              key={value}
              value={value}
              className={`${index < 3 ? "col-span-2" : "col-span-3"} min-h-11 w-full rounded-lg px-2 text-sm leading-tight text-white/65 hover:text-white data-active:bg-brand-yellow data-active:text-[#171714] md:col-span-1 md:w-auto md:flex-none md:rounded-xl md:px-4 dark:data-active:bg-brand-yellow dark:data-active:text-[#171714]`}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          value="profile"
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card sm:mt-5 sm:rounded-2xl inert:hidden"
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
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card sm:mt-5 sm:rounded-2xl inert:hidden"
        >
          <section aria-label="Impostazioni Anthon">
            <PreferencesSection />
          </section>
        </TabsContent>

        <TabsContent
          value="security"
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card sm:mt-5 sm:rounded-2xl inert:hidden"
        >
          <section aria-label="Sicurezza account">
            <SecuritySection />
          </section>
        </TabsContent>

        <TabsContent
          value="sessions"
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card sm:mt-5 sm:rounded-2xl inert:hidden"
        >
          <section aria-label="Sessioni attive">
            <SessionsSection />
          </section>
        </TabsContent>

        <TabsContent
          value="connected"
          className="mt-4 overflow-hidden rounded-xl border border-border bg-card sm:mt-5 sm:rounded-2xl inert:hidden"
        >
          <section aria-label="Account collegati">
            <ConnectedAccountsSection />
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
