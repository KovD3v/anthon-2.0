"use client";

import {
  ArrowRight,
  Brain,
  CheckCircle2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  AuthErrorSummary,
  AuthField,
  AuthSubmitButton,
  PasswordField,
} from "@/app/(auth)/_components/auth-controls";
import { LEGAL_LINKS } from "@/lib/legal-links";

type BetaAccessClientProps = {
  initialReturnTo: string;
  unavailable: boolean;
};

type ApiPayload = {
  error?: string;
  message?: string;
  returnTo?: string;
};

async function readPayload(response: Response): Promise<ApiPayload> {
  try {
    return (await response.json()) as ApiPayload;
  } catch {
    return {};
  }
}

function ConsentCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <span className="transition-colors group-hover:text-foreground">
        {children}
      </span>
    </label>
  );
}

function PanelLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <p className="flex items-center gap-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-primary">
        {icon}
        {children}
      </p>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

export function BetaAccessClient({
  initialReturnTo,
  unavailable,
}: BetaAccessClientProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(
    unavailable
      ? "L’accesso beta è temporaneamente non disponibile. Riprova tra poco."
      : null,
  );
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [email, setEmail] = useState("");
  const [releaseConsent, setReleaseConsent] = useState(false);
  const [updatesConsent, setUpdatesConsent] = useState(false);
  const [mailingError, setMailingError] = useState<string | null>(null);
  const [mailingSuccess, setMailingSuccess] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUnlocking || !password) return;
    setIsUnlocking(true);
    setAccessError(null);

    try {
      const response = await fetch("/api/beta-access/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, returnTo: initialReturnTo }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setAccessError(
          payload.error ?? "Non siamo riusciti a verificare l’accesso.",
        );
        return;
      }
      router.replace(payload.returnTo ?? "/");
    } catch {
      setAccessError("Non siamo riusciti a verificare l’accesso. Riprova.");
    } finally {
      setIsUnlocking(false);
    }
  }

  async function submitMailing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubscribing || !email.trim() || !releaseConsent) return;
    setIsSubscribing(true);
    setMailingError(null);
    setMailingSuccess(false);

    try {
      const response = await fetch("/api/beta-access/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          releaseConsent,
          updatesConsent,
        }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setMailingError(
          payload.error ?? "Non siamo riusciti a registrare l’iscrizione.",
        );
        return;
      }
      setMailingSuccess(true);
    } catch {
      setMailingError("Non siamo riusciti a registrare l’iscrizione. Riprova.");
    } finally {
      setIsSubscribing(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(21rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="relative flex min-h-[25rem] overflow-hidden bg-[#181814] px-6 py-7 text-[#f8f5eb] sm:px-10 sm:py-10 lg:min-h-dvh lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16 xl:py-14">
        <div
          className="pointer-events-none absolute -right-24 top-1/2 size-[28rem] -translate-y-1/2 rounded-full border border-[#f8f5eb]/10 sm:-right-12 lg:-right-40 lg:size-[38rem]"
          aria-hidden="true"
        >
          <div className="absolute inset-[14%] rounded-full border border-[#f8f5eb]/10" />
          <div className="absolute inset-[30%] rounded-full border border-[#c4cd4c]/35" />
          <span className="absolute inset-0 flex items-center justify-center font-display text-[13rem] font-extrabold leading-none text-[#f8f5eb]/[0.035] lg:text-[18rem]">
            β
          </span>
        </div>

        <div className="relative z-10 flex w-full flex-col justify-between gap-16 lg:h-full">
          <div className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <Brain className="size-6 text-[#c4cd4c]" aria-hidden="true" />
              Anthon
            </div>
            <div className="border border-[#f8f5eb]/20 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-[#f8f5eb]/65">
              Beta / 01
            </div>
          </div>

          <div className="max-w-[36rem] lg:my-auto">
            <div className="mb-7 h-1 w-16 bg-[#c4cd4c]" aria-hidden="true" />
            <h1 className="max-w-[10ch] text-balance font-display text-[clamp(3.25rem,7vw,6.75rem)] font-extrabold leading-[0.84] tracking-[-0.04em]">
              Anthon è in beta privata.
            </h1>
            <p className="mt-7 max-w-[30rem] text-pretty text-base leading-relaxed text-[#f8f5eb]/65 sm:text-lg">
              Stiamo lavorando con un gruppo ristretto di persone per rendere
              ogni conversazione più utile, solida e personale.
            </p>
          </div>

          <div className="hidden items-center gap-3 text-sm text-[#f8f5eb]/50 lg:flex">
            <ShieldCheck className="size-4 text-[#c4cd4c]" aria-hidden="true" />
            Accesso indipendente dal tuo account
          </div>
        </div>
      </section>

      <section className="flex min-h-dvh items-center px-5 py-10 sm:px-8 lg:px-10 lg:py-12 xl:px-16 2xl:px-20">
        <div className="mx-auto w-full max-w-[58rem]">
          <header className="mb-8 max-w-[40rem] sm:mb-10">
            <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Accesso riservato
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl font-extrabold leading-none tracking-[-0.025em] sm:text-4xl">
              Hai già la password?
            </h2>
            <p className="mt-3 max-w-[50ch] text-pretty leading-relaxed text-muted-foreground">
              Entra nella beta oppure lasciaci la tua email: ti avviseremo
              quando Anthon sarà pronto per tutti.
            </p>
          </header>

          <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <form
              aria-label="Accesso beta"
              onSubmit={submitAccess}
              className="rounded-xl border border-border bg-card p-5 sm:p-7"
            >
              <PanelLabel icon={<LockKeyhole className="size-4" />}>
                Entra nella beta
              </PanelLabel>
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">
                    Il tuo invito
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    La password vale per questo browser e non è collegata al tuo
                    account.
                  </p>
                </div>
                <PasswordField
                  id="beta-password"
                  label="Password beta"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                />
                <AuthErrorSummary message={accessError} />
                <AuthSubmitButton
                  loading={isUnlocking}
                  disabled={!password}
                  className="group"
                >
                  Entra in Anthon
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </AuthSubmitButton>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Resterai connesso per 180 giorni, salvo cambio della password
                  beta.
                </p>
              </div>
            </form>

            <form
              aria-label="Lista di attesa"
              onSubmit={submitMailing}
              className="rounded-xl border border-border bg-card p-5 sm:p-7"
            >
              <PanelLabel icon={<Mail className="size-4" />}>
                Resta aggiornato
              </PanelLabel>
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">
                    Vuoi entrare più avanti?
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Ti scriveremo quando Anthon uscirà dalla beta. Niente
                    account, nessun accesso automatico.
                  </p>
                </div>
                <AuthField
                  id="beta-mailing-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@esempio.it"
                />
                <div className="space-y-3 border-y border-border py-4">
                  <ConsentCheckbox
                    checked={releaseConsent}
                    onChange={setReleaseConsent}
                  >
                    Desidero essere avvisato quando Anthon sarà disponibile.
                  </ConsentCheckbox>
                  <ConsentCheckbox
                    checked={updatesConsent}
                    onChange={setUpdatesConsent}
                  >
                    Voglio ricevere anche novità, strumenti e informazioni su
                    Anthon.{" "}
                    <span className="text-foreground">Facoltativo.</span>
                  </ConsentCheckbox>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Puoi cambiare idea in qualsiasi momento. Leggi l’
                  <a
                    href={LEGAL_LINKS.privacy}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Informativa privacy
                  </a>
                  .
                </p>
                <AuthErrorSummary message={mailingError} />
                {mailingSuccess ? (
                  <output className="flex items-start gap-3 rounded-lg bg-primary/10 px-3.5 py-3 text-sm leading-relaxed text-foreground">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    Ti contatteremo al rilascio di Anthon.
                  </output>
                ) : null}
                <AuthSubmitButton
                  loading={isSubscribing}
                  disabled={!email.trim() || !releaseConsent}
                  variant="outline"
                >
                  Avvisami al rilascio
                </AuthSubmitButton>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
