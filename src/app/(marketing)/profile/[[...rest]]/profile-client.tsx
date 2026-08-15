"use client";

import { UserProfile, useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CoachingContextSection } from "../components/CoachingContextSection";
import { PreferencesSection } from "../components/PreferencesSection";
import { UsageSection } from "../components/UsageSection";

const clerkProfileAppearance = {
  cssLayerName: "clerk",
  theme: "simple",
  variables: {
    borderRadius: "0.75rem",
    colorBackground: "var(--card)",
    colorBorder: "var(--border)",
    colorForeground: "var(--foreground)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorDanger: "var(--destructive)",
    colorNeutral: "var(--foreground)",
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorRing: "var(--ring)",
    colorShadow: "transparent",
    colorShimmer: "var(--muted)",
    fontFamily:
      "var(--font-barlow), Barlow, ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons:
      "var(--font-barlow), Barlow, ui-sans-serif, system-ui, sans-serif",
    fontFamilyMono:
      "var(--font-geist-mono), Geist Mono, ui-monospace, monospace",
    fontSize: "0.875rem",
    spacing: "1rem",
  },
  elements: {
    rootBox: "w-full max-w-none",
    cardBox: "w-full max-w-none",
    card: "w-full max-w-none overflow-hidden rounded-2xl border border-border bg-card shadow-none",
    main: "bg-card",
    navbar: "border-border bg-card",
    navbarButtons: "gap-1 p-2",
    navbarButton:
      "rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground",
    navbarButton__active: "bg-primary/10 text-foreground",
    navbarButtonIcon: "text-muted-foreground",
    navbarButtonText: "font-medium",
    navbarMobileMenuRow: "border-b border-border bg-muted/30 px-2",
    navbarMobileMenuButton:
      "rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
    pageScrollBox: "bg-card",
    page: "bg-card",
    header: "border-b border-border bg-muted/30 px-6 py-5",
    headerTitle:
      "font-display text-2xl font-bold uppercase leading-none tracking-tight text-foreground",
    headerSubtitle: "mt-2 text-sm leading-relaxed text-muted-foreground",
    profilePage: "bg-card",
    profilePageContent: "bg-card",
    profileSection:
      "border-b border-border/70 bg-card px-6 py-5 last:border-b-0",
    profileSectionHeader: "mb-4",
    profileSectionTitle:
      "font-display text-lg font-bold uppercase tracking-tight text-foreground",
    profileSectionTitleText: "text-foreground",
    profileSectionSubtitle:
      "mt-1 text-sm leading-relaxed text-muted-foreground",
    profileSectionSubtitleText: "text-muted-foreground",
    profileSectionContent: "text-foreground",
    profileSectionItemList: "divide-y divide-border/60",
    profileSectionItem:
      "flex min-h-16 items-center justify-between gap-4 py-4 first:pt-0 last:pb-0",
    profileSectionButtonGroup: "flex flex-wrap gap-2",
    profileSectionPrimaryButton:
      "rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    formButtonPrimary:
      "rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    formButtonReset:
      "rounded-lg border border-border bg-transparent text-foreground shadow-none hover:bg-muted",
    formFieldRow: "gap-2",
    formField: "gap-2",
    formFieldLabelRow: "gap-2",
    formFieldLabel: "font-medium text-foreground",
    formFieldInput:
      "rounded-lg border border-input bg-background text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
    formFieldHintText: "text-xs text-muted-foreground",
    formFieldErrorText: "text-xs text-destructive",
    formFieldInputGroup: "rounded-lg",
    input:
      "rounded-lg border border-input bg-background text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
    button: "rounded-lg hover:bg-muted",
    dividerRow: "text-muted-foreground",
    dividerLine: "bg-border",
    dividerText: "text-xs text-muted-foreground",
    avatarBox: "rounded-2xl ring-2 ring-primary/20",
    avatarImage: "rounded-2xl",
    avatarImageActions: "gap-2",
    avatarImageActionsUpload:
      "rounded-lg border border-border bg-background text-foreground hover:bg-muted",
    avatarImageActionsRemove:
      "rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
    identityPreview: "rounded-xl border border-border bg-muted/30",
    identityPreviewText: "text-foreground",
    badge:
      "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary",
    footer: "border-t border-border bg-muted/20 px-6 py-4",
    footerItem: "text-xs text-muted-foreground",
    footerActionLink: "text-muted-foreground hover:text-foreground",
  },
} as const;

export function ProfileClient() {
  const router = useRouter();
  const { isLoaded, user } = useUser();

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
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
        {/* Account management keeps Clerk's flows on Anthon's visual system. */}
        <section aria-label="Account e sicurezza" className="w-full">
          <UserProfile appearance={clerkProfileAppearance} />
        </section>

        {isLoaded && user ? (
          <section aria-label="ID utente">
            <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
                <h2 className="text-lg font-semibold">ID utente</h2>
                <p className="text-sm text-muted-foreground">
                  L&apos;identificativo univoco del tuo account
                </p>
              </div>
              <div className="px-6 py-5">
                <code className="block break-all rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {user.id}
                </code>
              </div>
            </Card>
          </section>
        ) : null}

        <UsageSection />

        {/* Preferences Section */}
        <PreferencesSection />
        <CoachingContextSection />
      </div>
    </div>
  );
}
