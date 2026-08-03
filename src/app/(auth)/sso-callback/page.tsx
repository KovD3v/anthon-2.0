"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { AuthFormPanel, AuthHeader } from "../_components/auth-shell";

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={<SsoCallbackStatus />}>
      <SsoCallbackContent />
    </Suspense>
  );
}

function SsoCallbackContent() {
  const searchParams = useSearchParams();
  const continuation = getSafeAuthContinuation(
    searchParams.get("redirect_url"),
  );
  const continueUrl = `/auth-continue?${new URLSearchParams({ redirect_url: continuation })}`;

  return (
    <AuthFormPanel>
      <SsoCallbackStatusContent />
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={continuation}
        signUpForceRedirectUrl={continuation}
        continueSignUpUrl={continueUrl}
        firstFactorUrl={continueUrl}
        secondFactorUrl={continueUrl}
        verifyEmailAddressUrl={continueUrl}
        resetPasswordUrl={`/forgot-password?${new URLSearchParams({ redirect_url: continuation })}`}
      />
    </AuthFormPanel>
  );
}

function SsoCallbackStatus() {
  return (
    <AuthFormPanel>
      <SsoCallbackStatusContent />
    </AuthFormPanel>
  );
}

function SsoCallbackStatusContent() {
  return (
    <>
      <AuthHeader
        title="Completiamo l’accesso"
        description="Stiamo verificando il provider scelto. Ti riportiamo subito ad Anthon."
      />
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
      </div>
      <output className="sr-only">Accesso in corso</output>
    </>
  );
}
