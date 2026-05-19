import { OrganizationProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationProfilePage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in?redirect_url=/organization");
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Organization</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are not part of any organization. Contact an administrator to be
            invited.
          </p>
          <div className="mt-6">
            <Link
              href="/chat"
              className="inline-flex items-center rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              Back to chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <OrganizationProfile path="/organization" routing="path" />
    </div>
  );
}
