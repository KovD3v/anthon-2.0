"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, errors, fetchStatus } = useSignUp();
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

  async function submitRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
