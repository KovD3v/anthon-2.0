import { SignUp } from "@clerk/nextjs";
import { getSafeGuestContinuation } from "@/lib/guest-continuation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const redirectUrl = getSafeGuestContinuation(
    (await searchParams).redirect_url,
  );

  return (
    <div className="h-dvh overflow-y-auto w-full">
      <div className="flex items-center justify-center min-h-dvh py-8">
        <SignUp forceRedirectUrl={redirectUrl} />
      </div>
    </div>
  );
}
