"use client";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useSignIn } from "@clerk/nextjs/legacy";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESET_PASSWORD_STRATEGY = "reset_password_email_code" as const;

type FlowStep = "email" | "verification" | "success";

function getErrorMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ??
      error.errors[0]?.message ??
      "Non è stato possibile completare la richiesta."
    );
  }

  return "Non è stato possibile completare la richiesta. Riprova.";
}

export function ForgotPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestResetCode() {
    if (!isLoaded || !signIn) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Inserisci il tuo indirizzo email.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await signIn.create({
        strategy: RESET_PASSWORD_STRATEGY,
        identifier: normalizedEmail,
      });
      setEmail(normalizedEmail);
      setStep("verification");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestResetCode();
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isLoaded || !signIn || !setActive) return;

    if (!code.trim()) {
      setError("Inserisci il codice ricevuto via email.");
      return;
    }

    if (!password) {
      setError("Inserisci una nuova password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: RESET_PASSWORD_STRATEGY,
        code: code.trim(),
        password,
      });

      if (result.status === "complete") {
        if (!result.createdSessionId) {
          throw new Error("Missing session after password reset");
        }

        await setActive({
          session: result.createdSessionId,
          navigate: async ({ session }) => {
            if (session?.currentTask) {
              router.replace("/sign-in");
              return;
            }

            router.replace("/chat");
          },
        });
        return;
      }

      if (result.status === "needs_second_factor") {
        setSuccessMessage(
          "La password è stata aggiornata. Per completare l'accesso, torna alla pagina di accesso e verifica il secondo fattore.",
        );
        setStep("success");
        return;
      }

      setError(
        "Il codice non è stato verificato. Richiedi un nuovo codice e riprova.",
      );
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function useAnotherEmail() {
    setStep("email");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }

  if (!isLoaded) {
    return (
      <Card className="border-border/70">
        <CardContent className="pt-6">
          <p className="text-center text-sm text-muted-foreground">
            Caricamento…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-xl shadow-black/5">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-yellow text-[#171714]">
          {step === "success" ? (
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          ) : (
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          )}
        </div>
        <CardTitle>
          {step === "success" ? "Password aggiornata" : "Reimposta la password"}
        </CardTitle>
        <CardDescription>
          {step === "email" &&
            "Inserisci l'email del tuo account e ti invieremo un codice di verifica."}
          {step === "verification" &&
            `Abbiamo inviato un codice a ${email}. Controlla anche la cartella spam.`}
          {step === "success" &&
            (successMessage ?? "La tua password è stata aggiornata.")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "email" && (
          <form className="space-y-5" onSubmit={handleRequestCode}>
            <div className="space-y-2">
              <Label htmlFor="forgot-password-email">Indirizzo email</Label>
              <Input
                id="forgot-password-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={error ? "forgot-password-error" : undefined}
                aria-invalid={Boolean(error)}
              />
            </div>

            {error && (
              <p
                id="forgot-password-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full bg-brand-yellow text-[#171714] hover:bg-brand-yellow/85"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Invio in corso…" : "Invia codice di reset"}
            </Button>
          </form>
        )}

        {step === "verification" && (
          <form className="space-y-5" onSubmit={handleResetPassword}>
            <div className="space-y-2">
              <Label htmlFor="forgot-password-code">Codice di verifica</Label>
              <Input
                id="forgot-password-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-describedby={error ? "forgot-password-error" : undefined}
                aria-invalid={Boolean(error)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="forgot-password-new">Nuova password</Label>
              <Input
                id="forgot-password-new"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={error ? "forgot-password-error" : undefined}
                aria-invalid={Boolean(error)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="forgot-password-confirm">
                Conferma nuova password
              </Label>
              <Input
                id="forgot-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-describedby={error ? "forgot-password-error" : undefined}
                aria-invalid={Boolean(error)}
              />
            </div>

            {error && (
              <p
                id="forgot-password-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full bg-brand-yellow text-[#171714] hover:bg-brand-yellow/85"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Aggiornamento in corso…" : "Aggiorna password"}
            </Button>

            <div className="flex items-center justify-between gap-3 text-sm">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-muted-foreground"
                onClick={useAnotherEmail}
                disabled={isSubmitting}
              >
                Usa un'altra email
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-muted-foreground"
                onClick={requestResetCode}
                disabled={isSubmitting}
              >
                Invia di nuovo il codice
              </Button>
            </div>
          </form>
        )}

        {step === "success" && (
          <div className="space-y-4 text-center" aria-live="polite">
            <Button
              asChild
              className="h-11 w-full bg-brand-yellow text-[#171714] hover:bg-brand-yellow/85"
            >
              <Link href="/sign-in">Vai all'accesso</Link>
            </Button>
          </div>
        )}

        {step !== "success" && (
          <div className="mt-6 text-center">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Torna all'accesso
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
