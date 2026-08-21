import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { BetaAdminClient } from "./beta-admin-client";

export const instant = false;

export default async function BetaAdminPage() {
  const { user, errorResponse } = await requireSuperAdmin();
  if (errorResponse || !user) redirect("/admin");
  return <BetaAdminClient />;
}
