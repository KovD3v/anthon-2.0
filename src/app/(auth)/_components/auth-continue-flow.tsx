"use client";

import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LEGAL_LINKS } from "@/lib/legal-links";
import {
  AuthErrorSummary,
  AuthField,
  AuthSubmitButton,
  VerificationCodeField,
} from "./auth-controls";
import {
  getAuthErrorMessage,
  getFieldErrorMessage,
  navigateAfterAuth,
} from "./auth-flow-utils";
import { AuthFormPanel, AuthHeader } from "./auth-shell";
import { MfaChallenge } from "./mfa-challenge";

export function AuthContinueFlow({ continuation }: { continuation: string }) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, errors, fetchStatus } = useSignUp();
  const continuationQuery = new URLSearchParams({
    redirect_url: continuation,
  }).toString();
  const restartSignUpHref = `/sign-up?${continuationQuery}`;
  const signInHref = `/sign-in?${continuationQuery}`;
  const [firstName, setFirstName] = useState(signUp.firstName ?? "");
  const [lastName, setLastName] = useState(signUp.lastName ?? "");
  const [email, setEmail] = useState(signUp.emailAddress ?? "");
  const [legalAccepted, setLegalAccepted] = useState(
    Boolean(signUp.legalAcceptedAt),
  );
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(
    signUp.unverifiedFields.includes("email_address"),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace(continuation);
  }, [authLoaded, continuation, isSignedIn, router]);

  if (!authLoaded || isSignedIn) {
    return (
      <AuthFormPanel>
        <AuthHeader
          title="Verifichiamo l’accesso"
          description="Stiamo recuperando la tua sessione."
        />
        <output className="text-sm text-muted-foreground" aria-live="polite">
          Accesso in corso…
        </output>
      </AuthFormPanel>
    );
  }

  async function finalizeSignUp() {
    const { error: finalizeError } = await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        navigateAfterAuth(router, continuation, decorateUrl);
      },
    });
    if (finalizeError) setError(getAuthErrorMessage(finalizeError));
  }

  async function finalizeSignIn() {
    const { error: finalizeError } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        navigateAfterAuth(router, continuation, decorateUrl);
      },
    });
    if (finalizeError) setError(getAuthErrorMessage(finalizeError));
  }

  if (
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_second_factor"
  ) {
    return (
      <AuthFormPanel>
        <MfaChallenge
          onComplete={finalizeSignIn}
          emailCodeAlreadySent={false}
        />
      </AuthFormPanel>
    );
  }

  if (!signUp.id) {
    return (
      <AuthFormPanel>
        <AuthHeader
          title="Riprendi l’accesso"
          description="La sessione di registrazione non è più disponibile. Ricomincia per entrare in Anthon."
        />
        <div className="space-y-3">
          <Button asChild className="h-11 w-full font-semibold">
            <Link href={restartSignUpHref}>Ricomincia registrazione</Link>
          </Button>
          <Button variant="outline" asChild className="h-11 w-full">
            <Link href={signInHref}>Accedi</Link>
          </Button>
        </div>
      </AuthFormPanel>
    );
  }

  async function submitRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!signUp.id) {
      router.replace(restartSignUpHref);
      return;
    }

    const needsLegal = signUp.missingFields.includes("legal_accepted");
    if (needsLegal && !legalAccepted) {
      setError("Accetta i Termini e l’Informativa privacy per continuare.");
      return;
    }

    const { error: updateError } = await signUp.update({
      firstName: signUp.missingFields.includes("first_name")
        ? firstName.trim()
        : undefined,
      lastName: signUp.missingFields.includes("last_name")
        ? lastName.trim()
        : undefined,
      emailAddress: signUp.missingFields.includes("email_address")
        ? email.trim()
        : undefined,
      legalAccepted: needsLegal ? legalAccepted : undefined,
      locale: "it-IT",
    });
    if (updateError) {
      setError(getAuthErrorMessage(updateError));
      return;
    }

    if (signUp.unverifiedFields.includes("email_address")) {
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setError(getAuthErrorMessage(sendError));
        return;
      }
      setAwaitingCode(true);
      return;
    }

    if (signUp.status === "complete") await finalizeSignUp();
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!signUp.id) {
      router.replace(restartSignUpHref);
      return;
    }

    const { error: verificationError } =
      await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (verificationError) {
      setError(getAuthErrorMessage(verificationError));
      return;
    }
    if (signUp.status === "complete") await finalizeSignUp();
  }

  return (
    <AuthFormPanel>
      <AuthHeader
        title={
          awaitingCode ? "Controlla la tua email" : "Completa il tuo account"
        }
        description={
          awaitingCode
            ? "Inserisci il codice per confermare il tuo indirizzo."
            : "Mancano poche informazioni per entrare in Anthon."
        }
      />

      {awaitingCode ? (
        <form onSubmit={verifyEmail} className="space-y-4">
          <VerificationCodeField
            id="continue-code"
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
      ) : (
        <form onSubmit={submitRequirements} className="space-y-4">
          {signUp.missingFields.includes("first_name") ? (
            <AuthField
              id="continue-first-name"
              label="Nome"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              error={getFieldErrorMessage(errors.fields.firstName)}
            />
          ) : null}
          {signUp.missingFields.includes("last_name") ? (
            <AuthField
              id="continue-last-name"
              label="Cognome"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              error={getFieldErrorMessage(errors.fields.lastName)}
            />
          ) : null}
          {signUp.missingFields.includes("email_address") ? (
            <AuthField
              id="continue-email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={getFieldErrorMessage(errors.fields.emailAddress)}
            />
          ) : null}
          {signUp.missingFields.includes("legal_accepted") ? (
            <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={legalAccepted}
                onChange={(event) => setLegalAccepted(event.target.checked)}
              />
              <span>
                Accetto i{" "}
                <a href={LEGAL_LINKS.terms} className="underline">
                  Termini
                </a>{" "}
                e l’
                <a href={LEGAL_LINKS.privacy} className="underline">
                  Informativa privacy
                </a>
                .
              </span>
            </label>
          ) : null}
          <AuthErrorSummary message={error} />
          <AuthSubmitButton
            loading={
              fetchStatus === "fetching" || signInFetchStatus === "fetching"
            }
          >
            Continua
          </AuthSubmitButton>
        </form>
      )}
    </AuthFormPanel>
  );
}
