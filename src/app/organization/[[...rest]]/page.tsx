import { OrganizationProfile, OrganizationSwitcher } from "@clerk/nextjs";
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
            No active organization selected. Choose one below, then reopen this
            page.
          </p>

          <div className="mt-4">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/organization"
              afterLeaveOrganizationUrl="/organization"
              afterSelectOrganizationUrl="/organization"
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            If you do not see any organization, ask an owner/admin to invite you
            first.
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
