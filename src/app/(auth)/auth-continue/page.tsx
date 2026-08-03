import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { AuthContinueFlow } from "../_components/auth-continue-flow";

export const metadata: Metadata = {
  title: "Completa l’accesso | Anthon",
};

export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const continuation = getSafeAuthContinuation(
    (await searchParams).redirect_url,
  );
  return <AuthContinueFlow continuation={continuation} />;
}
