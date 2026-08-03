import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reimposta la password | Anthon",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Accesso ad Anthon
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            Recupera il tuo account
          </h1>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
