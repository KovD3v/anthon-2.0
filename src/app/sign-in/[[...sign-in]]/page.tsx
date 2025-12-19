import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="h-dvh overflow-y-auto w-full">
      <div className="flex items-center justify-center min-h-dvh py-8">
        <SignIn />
      </div>
    </div>
  );
}
