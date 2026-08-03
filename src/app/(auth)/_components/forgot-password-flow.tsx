"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
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
import { MfaChallenge } from "./mfa-challenge";

type ResetStep = "email" | "code" | "password" | "challenge";

export function ForgotPasswordFlow({ continuation }: { continuation: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace(continuation);
  }, [continuation, isLoaded, isSignedIn, router]);

  async function finalize() {
    const { error: finalizeError } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        navigateAfterAuth(router, continuation, decorateUrl);
      },
    });
    if (finalizeError) setError(getAuthErrorMessage(finalizeError));
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Inserisci il tuo indirizzo email.");
      return;
    }

    const { error: createError } = await signIn.create({
      identifier: normalizedEmail,
    });
    if (createError) {
      setError(getAuthErrorMessage(createError));
      return;
    }

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setError(getAuthErrorMessage(sendError));
      return;
    }

    setEmail(normalizedEmail);
    setStep("code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError("Inserisci il codice ricevuto via email.");
      return;
    }

    const { error: verificationError } =
      await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (verificationError) {
      setError(getAuthErrorMessage(verificationError));
      return;
    }

    if (signIn.status === "needs_new_password") {
      setStep("password");
      return;
    }

    setError("Il codice non ha completato la verifica. Richiedine uno nuovo.");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    const { error: passwordError } =
      await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      });
    if (passwordError) {
      setError(getAuthErrorMessage(passwordError));
      return;
    }

    if (signIn.status === "complete") {
      await finalize();
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) {
        setError(getAuthErrorMessage(sendError));
        return;
      }
      setStep("challenge");
      return;
    }

    if (signIn.status === "needs_second_factor") {
      setStep("challenge");
      return;
    }

    setError("La password è stata aggiornata, ma l’accesso non è completo.");
  }

  async function resendCode() {
    setError(null);
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) setError(getAuthErrorMessage(sendError));
  }

  async function restart() {
    await signIn.reset();
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setStep("email");
  }

  return (
    <AuthFormPanel>
      <AuthStepTransition>
        {step === "challenge" ? (
          <MfaChallenge onComplete={finalize} />
        ) : (
          <>
            <AuthHeader
              title={
                step === "email"
                  ? "Reimposta la password"
                  : "Controlla la tua email"
              }
              description={
                step === "email"
                  ? "Ti invieremo un codice per scegliere una nuova password."
                  : `Usa il codice inviato a ${maskEmail(email)}.`
              }
            />

            {step === "email" ? (
              <form onSubmit={requestCode} className="space-y-4">
                <AuthField
                  id="reset-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.identifier)}
                />
                <AuthErrorSummary message={error} />
                <AuthSubmitButton loading={fetchStatus === "fetching"}>
                  Invia il codice
                </AuthSubmitButton>
              </form>
            ) : null}

            {step === "code" ? (
              <form onSubmit={verifyCode} className="space-y-4">
                <VerificationCodeField
                  id="reset-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.code)}
                  autoFocus
                />
                <AuthErrorSummary message={error} />
                <AuthSubmitButton loading={fetchStatus === "fetching"}>
                  Verifica il codice
                </AuthSubmitButton>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full"
                  onClick={resendCode}
                >
                  Invia un nuovo codice
                </Button>
              </form>
            ) : null}

            {step === "password" ? (
              <form onSubmit={submitPassword} className="space-y-4">
                <PasswordField
                  id="reset-password"
                  label="Nuova password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.password)}
                  hint="Almeno 8 caratteri. Tutte le altre sessioni verranno disconnesse."
                />
                <PasswordField
                  id="reset-password-confirmation"
                  label="Conferma nuova password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <AuthErrorSummary message={error} />
                <AuthSubmitButton loading={fetchStatus === "fetching"}>
                  Salva e accedi
                </AuthSubmitButton>
              </form>
            ) : null}

            <div className="mt-5 flex min-h-11 items-center justify-between text-sm">
              {step !== "email" ? (
                <button
                  type="button"
                  onClick={restart}
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  Cambia email
                </button>
              ) : (
                <span />
              )}
              <Link
                href={`/sign-in?${new URLSearchParams({ redirect_url: continuation })}`}
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Torna all’accesso
              </Link>
            </div>
          </>
        )}
      </AuthStepTransition>
    </AuthFormPanel>
  );
}
