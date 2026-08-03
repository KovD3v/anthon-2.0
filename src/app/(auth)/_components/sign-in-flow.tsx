"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  AuthDivider,
  AuthErrorSummary,
  AuthField,
  AuthSubmitButton,
  PasswordField,
} from "./auth-controls";
import {
  getAuthErrorMessage,
  getFieldErrorMessage,
  navigateAfterAuth,
} from "./auth-flow-utils";
import { AuthFormPanel, AuthHeader, AuthStepTransition } from "./auth-shell";
import { MfaChallenge } from "./mfa-challenge";
import { OAuthButtons } from "./oauth-buttons";

export function SignInFlow({ continuation }: { continuation: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Inserisci email e password.");
      return;
    }

    const { error: passwordError } = await signIn.password({
      emailAddress: normalizedEmail,
      password,
    });
    if (passwordError) {
      setError(
        getAuthErrorMessage(passwordError, "Email o password non corretti."),
      );
      return;
    }

    if (signIn.status === "complete") {
      await finalize();
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const hasEmailCode = signIn.supportedSecondFactors.some(
        (factor) => factor.strategy === "email_code",
      );
      if (!hasEmailCode) {
        setError(
          "Questo account richiede un metodo di verifica non disponibile.",
        );
        return;
      }
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) setError(getAuthErrorMessage(sendError));
      return;
    }

    if (signIn.status !== "needs_second_factor") {
      setError("L’accesso non è stato completato. Ricomincia e riprova.");
    }
  }

  async function restart() {
    await signIn.reset();
    setPassword("");
    setError(null);
  }

  const needsChallenge =
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_second_factor";

  return (
    <AuthFormPanel>
      <AuthStepTransition>
        {needsChallenge ? (
          <div className="space-y-5">
            <MfaChallenge onComplete={finalize} />
            <button
              type="button"
              onClick={restart}
              className="min-h-11 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ricomincia
            </button>
          </div>
        ) : (
          <>
            <AuthHeader
              title="Bentornato"
              description="Riprendi il lavoro da dove l’hai lasciato."
            />

            <div className="space-y-5">
              <OAuthButtons
                mode="sign-in"
                continuation={continuation}
                onError={setError}
              />
              <AuthDivider />

              <form onSubmit={submit} className="space-y-4" noValidate>
                <AuthField
                  id="sign-in-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={getFieldErrorMessage(errors.fields.identifier)}
                />
                <div className="space-y-1">
                  <PasswordField
                    id="sign-in-password"
                    label="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    error={getFieldErrorMessage(errors.fields.password)}
                  />
                  <div className="flex justify-end">
                    <Link
                      href={`/forgot-password?${new URLSearchParams({ redirect_url: continuation })}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Password dimenticata?
                    </Link>
                  </div>
                </div>
                <AuthErrorSummary message={error} />
                <AuthSubmitButton loading={fetchStatus === "fetching"}>
                  Accedi
                </AuthSubmitButton>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Non hai un account?{" "}
                <Link
                  href={`/sign-up?${new URLSearchParams({ redirect_url: continuation })}`}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Registrati
                </Link>
              </p>
            </div>
          </>
        )}
      </AuthStepTransition>
    </AuthFormPanel>
  );
}
