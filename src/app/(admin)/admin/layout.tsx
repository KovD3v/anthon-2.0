import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AdminLayoutClient from "./layout-client";

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
