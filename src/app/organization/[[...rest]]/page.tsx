import { OrganizationProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in?redirect_url=/organization");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <OrganizationProfile path="/organization" routing="path" />
    </div>
  );
}
