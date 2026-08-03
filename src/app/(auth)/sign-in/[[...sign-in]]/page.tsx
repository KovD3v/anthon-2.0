import type { Metadata } from "next";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";
import { SignInFlow } from "../../_components/sign-in-flow";

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
