import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { ForgotPasswordFlow } from "../_components/forgot-password-flow";

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
