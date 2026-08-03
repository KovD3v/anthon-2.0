"use client";

import { useSignIn } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AuthErrorSummary,
  AuthSubmitButton,
  VerificationCodeField,
} from "./auth-controls";
import { getAuthErrorMessage, getFieldErrorMessage } from "./auth-flow-utils";

type Factor = "email_code" | "phone_code" | "totp" | "backup_code";

export function MfaChallenge({
  onComplete,
  emailCodeAlreadySent = true,
}: {
  onComplete: () => Promise<void>;
  emailCodeAlreadySent?: boolean;
}) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const availableFactors = useMemo(() => {
    const factors = new Set<Factor>();
    for (const factor of signIn.supportedSecondFactors) {
      if (
        factor.strategy === "email_code" ||
        factor.strategy === "phone_code" ||
        factor.strategy === "totp" ||
        factor.strategy === "backup_code"
      ) {
        factors.add(factor.strategy);
      }
    }
    return factors;
  }, [signIn.supportedSecondFactors]);
  const isClientTrust = signIn.status === "needs_client_trust";
  const initialFactor: Factor = isClientTrust
    ? "email_code"
    : availableFactors.has("phone_code")
      ? "phone_code"
      : availableFactors.has("totp")
        ? "totp"
        : availableFactors.has("email_code")
          ? "email_code"
          : "backup_code";
  const [factor, setFactor] = useState<Factor>(initialFactor);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sentFactor = useRef<Factor | null>(
    isClientTrust && emailCodeAlreadySent ? "email_code" : null,
  );

  useEffect(() => {
    if (
      (factor !== "phone_code" && factor !== "email_code") ||
      sentFactor.current === factor
    ) {
      return;
    }
    sentFactor.current = factor;
    const send =
      factor === "email_code"
        ? signIn.mfa.sendEmailCode()
        : signIn.mfa.sendPhoneCode();
    void send.then(({ error: sendError }) => {
      if (sendError) setError(getAuthErrorMessage(sendError));
    });
  }, [factor, signIn]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Inserisci il codice di verifica.");
      return;
    }

    const result =
      factor === "email_code"
        ? await signIn.mfa.verifyEmailCode({ code: trimmedCode })
        : factor === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code: trimmedCode })
          : factor === "totp"
            ? await signIn.mfa.verifyTOTP({ code: trimmedCode })
            : await signIn.mfa.verifyBackupCode({ code: trimmedCode });

    if (result.error) {
      setError(getAuthErrorMessage(result.error));
      return;
    }

    if (signIn.status === "complete") {
      await onComplete();
    }
  }

  async function resend() {
    setError(null);
    const result =
      factor === "email_code"
        ? await signIn.mfa.sendEmailCode()
        : await signIn.mfa.sendPhoneCode();
    if (result.error) setError(getAuthErrorMessage(result.error));
  }

  async function changeFactor(nextFactor: Factor) {
    setFactor(nextFactor);
    setCode("");
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl font-bold tracking-[-0.02em]">
          Verifica il tuo account
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isClientTrust
            ? "Questo dispositivo è nuovo. Inserisci il codice inviato alla tua email."
            : "Completa il secondo fattore configurato sul tuo account."}
        </p>
      </div>

      {!isClientTrust && availableFactors.size > 1 ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Metodo di verifica</legend>
          {availableFactors.has("phone_code") ? (
            <FactorButton
              active={factor === "phone_code"}
              onClick={() => changeFactor("phone_code")}
            >
              SMS
            </FactorButton>
          ) : null}
          {availableFactors.has("totp") ? (
            <FactorButton
              active={factor === "totp"}
              onClick={() => changeFactor("totp")}
            >
              App authenticator
            </FactorButton>
          ) : null}
          {availableFactors.has("email_code") ? (
            <FactorButton
              active={factor === "email_code"}
              onClick={() => changeFactor("email_code")}
            >
              Email
            </FactorButton>
          ) : null}
          {availableFactors.has("backup_code") ? (
            <FactorButton
              active={factor === "backup_code"}
              onClick={() => changeFactor("backup_code")}
            >
              Codice di recupero
            </FactorButton>
          ) : null}
        </fieldset>
      ) : null}

      <form onSubmit={verify} className="space-y-4">
        <VerificationCodeField
          id="mfa-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={getFieldErrorMessage(errors.fields.code)}
          autoFocus
        />
        <AuthErrorSummary message={error} />
        <AuthSubmitButton loading={fetchStatus === "fetching"}>
          Verifica e accedi
        </AuthSubmitButton>
      </form>

      {factor === "email_code" || factor === "phone_code" ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={resend}
        >
          Invia un nuovo codice
        </Button>
      ) : null}
    </div>
  );
}

function FactorButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
