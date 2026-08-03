import type { Metadata } from "next";
import { getSafeGuestContinuation } from "@/lib/guest-continuation";
import { SignUpFlow } from "../../_components/sign-up-flow";

export const metadata: Metadata = {
  title: "Registrati | Anthon",
  description: "Crea il tuo spazio personale Anthon.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const continuation = getSafeGuestContinuation(
    (await searchParams).redirect_url,
  );

  return <SignUpFlow continuation={continuation} />;
}
