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
        badge__freeTrial: "Prova gratuita",
        badge__currentPlan: "Piano attuale",
        billing: {
          month: "mese",
          year: "anno",
          free: "Gratis",
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
