import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { IdentifyUser } from "@/components/providers/identify-user";
import { MotionProvider } from "@/components/providers/motion-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Viewport configuration for mobile optimization
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5eb" },
    { media: "(prefers-color-scheme: dark)", color: "#151512" },
  ],
};

export const metadata: Metadata = {
  title: "Anthon - AI Mental Coach",
  description: "Il tuo mental coach personale basato sull'IA.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Anthon",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={{
        locale: "it-IT",
        backButton: "Indietro",
        formButtonPrimary: "Continua",
        formFieldLabel__emailAddress: "Indirizzo email",
        formFieldLabel__firstName: "Nome",
        formFieldLabel__lastName: "Cognome",
        formFieldLabel__username: "Nome utente",
        badge__primary: "Principale",
        badge__freeTrial: "Prova gratuita",
        badge__currentPlan: "Piano attuale",
        badge__activePlan: "Attivo",
        billing: {
          month: "mese",
          year: "anno",
          free: "Gratis",
          defaultFreePlanActive: "Piano gratuito attivo",
          getStarted: "Inizia",
          manage: "Gestisci",
          manageSubscription: "Gestisci abbonamento",
          cancelSubscription: "Annulla abbonamento",
          keepSubscription: "Mantieni abbonamento",
          reSubscribe: "Riattiva abbonamento",
          subscribe: "Abbonati",
          startFreeTrial: "Inizia la prova gratuita",
          startFreeTrial__days: "Prova gratuita di {{days}} giorni",
          switchPlan: "Cambia piano",
          switchToMonthly: "Passa alla fatturazione mensile",
          switchToAnnual: "Passa alla fatturazione annuale",
          billedAnnually: "Fatturazione annuale",
          billedMonthlyOnly: "Fatturazione mensile",
          monthly: "Mensile",
          annually: "Annuale",
          popular: "Più scelto",
          viewFeatures: "Vedi funzionalità",
          seeAllFeatures: "Vedi tutte le funzionalità",
          availableFeatures: "Funzionalità incluse",
          pricingTable: {
            billingCycle: "Ciclo di fatturazione",
            included: "Incluso",
          },
          checkout: {
            perMonth: "al mese",
          },
        },
        userProfile: {
          mobileButton__menu: "Menu",
          formButtonPrimary__continue: "Continua",
          formButtonPrimary__save: "Salva",
          formButtonPrimary__finish: "Fine",
          formButtonPrimary__remove: "Rimuovi",
          formButtonPrimary__add: "Aggiungi",
          formButtonReset: "Annulla",
          navbar: {
            title: "Profilo",
            description: "Gestisci il tuo account",
            account: "Account",
            security: "Sicurezza",
            billing: "Fatturazione",
            apiKeys: "Chiavi API",
          },
          start: {
            headerTitle__account: "Dettagli del profilo",
            headerTitle__security: "Sicurezza",
            profileSection: {
              title: "Profilo",
              primaryButton: "Aggiorna profilo",
            },
            usernameSection: {
              title: "Nome utente",
              primaryButton__updateUsername: "Aggiorna nome utente",
              primaryButton__setUsername: "Imposta nome utente",
            },
            emailAddressesSection: {
              title: "Indirizzi email",
              primaryButton: "Aggiungi indirizzo email",
              detailsAction__primary: "Principale",
              detailsAction__nonPrimary: "Imposta come principale",
              detailsAction__unverified: "Non verificato",
              destructiveAction: "Rimuovi indirizzo email",
            },
            connectedAccountsSection: {
              title: "Account collegati",
              primaryButton: "Collega account",
              actionLabel__connectionFailed: "Connessione non riuscita",
              subtitle__disconnected: "Disconnesso",
              destructiveActionTitle: "Rimuovi account collegato",
            },
            passwordSection: {
              title: "Password",
              primaryButton__updatePassword: "Aggiorna password",
              primaryButton__setPassword: "Imposta password",
            },
            activeDevicesSection: {
              title: "Dispositivi attivi",
              destructiveAction: "Disconnetti dispositivo",
            },
            dangerSection: {
              title: "Zona pericolosa",
              deleteAccountButton: "Elimina account",
            },
          },
          profilePage: {
            title: "Aggiorna profilo",
            imageFormTitle: "Immagine del profilo",
            imageFormSubtitle: "Carica un'immagine per il tuo profilo",
            imageFormDestructiveActionSubtitle: "Rimuovi immagine",
            fileDropAreaHint: "Trascina qui un'immagine o seleziona un file",
            readonly: "Queste informazioni non possono essere modificate",
            successMessage: "Profilo aggiornato",
          },
          usernamePage: {
            successMessage: "Nome utente aggiornato",
            title__set: "Imposta nome utente",
            title__update: "Aggiorna nome utente",
          },
        },
      }}
    >
      <html
        lang="it"
        className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <body className={`${barlow.className} antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <IdentifyUser />
            <QueryProvider>
              <MotionProvider>{children}</MotionProvider>
            </QueryProvider>
            <ToastProvider />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
