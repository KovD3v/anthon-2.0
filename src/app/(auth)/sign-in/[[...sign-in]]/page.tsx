import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { SignInFlow } from "../../_components/sign-in-flow";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Accedi | Anthon",
  description: "Accedi al tuo spazio personale Anthon.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const continuation = getSafeAuthContinuation(
    (await searchParams).redirect_url,
  );

  return <SignInFlow continuation={continuation} />;
}
