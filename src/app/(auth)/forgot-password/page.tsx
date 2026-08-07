import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { ForgotPasswordFlow } from "../_components/forgot-password-flow";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Reimposta la password | Anthon",
  description: "Recupera l’accesso al tuo account Anthon.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const continuation = getSafeAuthContinuation(
    (await searchParams).redirect_url,
  );
  return <ForgotPasswordFlow continuation={continuation} />;
}
