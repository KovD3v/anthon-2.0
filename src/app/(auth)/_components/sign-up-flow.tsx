"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LEGAL_LINKS } from "@/lib/legal-links";
import {
  AuthDivider,
  AuthErrorSummary,
  AuthField,
  AuthSubmitButton,
  PasswordField,
  VerificationCodeField,
} from "./auth-controls";
import {
  getAuthErrorMessage,
  getFieldErrorMessage,
  maskEmail,
  navigateAfterAuth,
} from "./auth-flow-utils";
import { AuthFormPanel, AuthHeader, AuthStepTransition } from "./auth-shell";
import { OAuthButtons } from "./oauth-buttons";

type SignUpStep = "details" | "verification";

export function SignUpFlow({ continuation }: { continuation: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [step, setStep] = useState<SignUpStep>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace(continuation);
  }, [continuation, isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function finalize() {
    const { error: finalizeError } = await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        navigateAfterAuth(router, continuation, decorateUrl);
      },
    });
    if (finalizeError) setError(getAuthErrorMessage(finalizeError));
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError("Inserisci email e password.");
      return;
    }
    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (!legalAccepted) {
      setError("Accetta i Termini e l’Informativa privacy per continuare.");
      return;
    }

    const { error: passwordError } = await signUp.password({
      emailAddress: normalizedEmail,
      password,
      legalAccepted: true,
      locale: "it-IT",
    });
    if (passwordError) {
      setError(getAuthErrorMessage(passwordError));
      return;
    }

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setError(getAuthErrorMessage(sendError));
      return;
    }

    setEmail(normalizedEmail);
    setResendSeconds(30);
    setStep("verification");
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError("Inserisci il codice ricevuto via email.");
      return;
    }

    const { error: verificationError } =
      await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (verificationError) {
      setError(getAuthErrorMessage(verificationError));
      return;
    }

    if (signUp.status === "complete") {
      await finalize();
      return;
    }

    setError("La registrazione richiede ancora alcune informazioni.");
  }

  async function resendCode() {
    if (resendSeconds > 0) return;
    setError(null);
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setError(getAuthErrorMessage(sendError));
      return;
    }
    setResendSeconds(30);
  }

  async function editEmail() {
    await signUp.reset();
    setCode("");
    setPassword("");
    setError(null);
    setStep("details");
  }

  return (
    <AuthFormPanel>
      <AuthStepTransition>
        {step === "verification" ? (
          <>
            <AuthHeader
              title="Controlla la tua email"
              description={`Abbiamo inviato un codice a ${maskEmail(email)}.`}
            />
            <form onSubmit={verifyEmail} className="space-y-4">
              <VerificationCodeField
                id="sign-up-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                error={getFieldErrorMessage(errors.fields.code)}
                autoFocus
              />
              <AuthErrorSummary message={error} />
              <AuthSubmitButton loading={fetchStatus === "fetching"}>
                Verifica email
              </AuthSubmitButton>
            </form>
            <div className="mt-4 grid gap-1 sm:grid-cols-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={resendCode}
                disabled={resendSeconds > 0 || fetchStatus === "fetching"}
              >
                {resendSeconds > 0
                  ? `Nuovo codice tra ${resendSeconds}s`
                  : "Invia un nuovo codice"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={editEmail}
              >
                Modifica email
              </Button>
            </div>
          </>
        ) : (
          <>
            <AuthHeader
              title="Inizia con Anthon"
              description="Crea il tuo spazio personale in meno di un minuto."
            />

            <div className="space-y-5">
              <OAuthButtons
                mode="sign-up"
                continuation={continuation}
                legalAccepted={legalAccepted}
                onError={setError}
              />
              <AuthDivider />

              <form onSubmit={submitDetails} className="space-y-4" noValidate>
                <AuthField
                  id="sign-up-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.emailAddress)}
                />
                <PasswordField
                  id="sign-up-password"
                  label="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.password)}
                  hint="Almeno 8 caratteri. Evita password già usate altrove."
                />
                <div id="clerk-captcha" />
                <label className="mx-auto flex max-w-[34rem] cursor-pointer items-start justify-center gap-3 text-center text-sm leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={legalAccepted}
                    onChange={(event) => setLegalAccepted(event.target.checked)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    aria-invalid={Boolean(errors.fields.legalAccepted)}
                  />
                  <span>
                    Accetto i{" "}
                    <a
                      href={LEGAL_LINKS.terms}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Termini
                    </a>{" "}
                    e l’
                    <a
                      href={LEGAL_LINKS.privacy}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Informativa privacy
                    </a>
                    .
                  </span>
                </label>
                <AuthErrorSummary
                  message={error || getFieldErrorMessage(errors.fields.captcha)}
                />
                <AuthSubmitButton loading={fetchStatus === "fetching"}>
                  Crea il mio account
                </AuthSubmitButton>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Hai già un account?{" "}
                <Link
                  href={`/sign-in?${new URLSearchParams({ redirect_url: continuation })}`}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Accedi
                </Link>
              </p>
            </div>
          </>
        )}
      </AuthStepTransition>
    </AuthFormPanel>
  );
}
