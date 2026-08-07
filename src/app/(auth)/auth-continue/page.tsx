import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { AuthContinueFlow } from "../_components/auth-continue-flow";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
