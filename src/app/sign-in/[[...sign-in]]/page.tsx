import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function Page() {
  return (
    <div className="h-dvh overflow-y-auto w-full">
      <div className="flex items-center justify-center min-h-dvh py-8">
        <div>
          <SignIn />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Hai dimenticato la password?{" "}
            <Link
              href="/forgot-password"
              className="font-medium text-brand-yellow hover:underline"
            >
              Reimpostala
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
