import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AdminLayoutClient from "./layout-client";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side admin check
  const { errorResponse } = await requireAdmin();

  if (errorResponse) {
    // Not an admin, redirect to home
    redirect("/");
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
