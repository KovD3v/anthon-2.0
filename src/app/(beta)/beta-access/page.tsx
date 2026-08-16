import type { Metadata } from "next";
import { sanitizeBetaReturnTo } from "@/lib/beta-access/return-to";
import { BetaAccessClient } from "./beta-access-client";

export const instant = false;

export const metadata: Metadata = {
  title: "Beta privata | Anthon",
  description: "Accedi alla beta privata di Anthon o iscriviti al rilascio.",
};

export default async function BetaAccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    error?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const returnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <BetaAccessClient
      initialReturnTo={sanitizeBetaReturnTo(returnTo ?? null)}
      unavailable={error === "unavailable"}
    />
  );
}
