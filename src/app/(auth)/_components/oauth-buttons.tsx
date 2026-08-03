"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { Apple } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAuthErrorMessage } from "./auth-flow-utils";

const PROVIDERS = [
  { strategy: "oauth_apple", label: "Apple", icon: Apple },
  { strategy: "oauth_facebook", label: "Facebook", icon: FacebookIcon },
  { strategy: "oauth_google", label: "Google", icon: GoogleIcon },
] as const;

export function OAuthButtons({
  mode,
  continuation,
  legalAccepted = false,
  onError,
}: {
  mode: "sign-in" | "sign-up";
  continuation: string;
  legalAccepted?: boolean;
  onError: (message: string) => void;
}) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  async function startOAuth(strategy: (typeof PROVIDERS)[number]["strategy"]) {
    if (mode === "sign-up" && !legalAccepted) {
      onError("Accetta i Termini e l’Informativa privacy per continuare.");
      return;
    }

    setActiveProvider(strategy);
    onError("");
    const query = new URLSearchParams({ redirect_url: continuation });
    const params = {
      strategy,
      redirectUrl: `/sso-callback?${query}`,
      redirectCallbackUrl: `/auth-continue?${query}`,
    };
    const { error } =
      mode === "sign-up"
        ? await signUp.sso({ ...params, legalAccepted: true, locale: "it-IT" })
        : await signIn.sso(params);

    if (error) {
      setActiveProvider(null);
      onError(getAuthErrorMessage(error));
    }
  }

  return (
    <fieldset className="grid grid-cols-3 gap-2">
      <legend className="sr-only">Accesso con provider social</legend>
      {PROVIDERS.map(({ strategy, label, icon: Icon }) => (
        <Button
          key={strategy}
          type="button"
          variant="outline"
          className="h-11 bg-background px-2"
          onClick={() => startOAuth(strategy)}
          disabled={activeProvider !== null}
          aria-label={`Continua con ${label}`}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </fieldset>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.24a4.48 4.48 0 0 1-1.94 2.94v2.54h3.14c1.84-1.69 2.91-4.19 2.91-7.32Z"
      />
      <path
        fill="currentColor"
        d="M12 21.75c2.62 0 4.82-.87 6.44-2.36l-3.14-2.43c-.87.58-1.98.92-3.3.92-2.53 0-4.68-1.71-5.45-4.01H3.31v2.51A9.73 9.73 0 0 0 12 21.75Z"
      />
      <path
        fill="currentColor"
        d="M6.55 13.87A5.84 5.84 0 0 1 6.25 12c0-.65.11-1.28.3-1.87V7.62H3.31A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.05 1.06 4.38l3.24-2.51Z"
      />
      <path
        fill="currentColor"
        d="M12 6.12c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.36 9.36 0 0 0 12 2.25a9.73 9.73 0 0 0-8.69 5.37l3.24 2.51c.77-2.3 2.92-4.01 5.45-4.01Z"
      />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.19 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.23.2 2.23.2V8.6h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.77l-.44 2.91h-2.33V22C18.34 21.25 22 17.08 22 12.06Z"
      />
    </svg>
  );
}
