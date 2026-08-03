export function assertEphemeralE2EBranch() {
  const ephemeralBranchId = process.env.E2E_EPHEMERAL_BRANCH_ID?.trim();
  if (!ephemeralBranchId?.startsWith("br-")) {
    throw new Error(
      "E2E_EPHEMERAL_BRANCH_ID is required. Run `bun run test:e2e` so the suite uses an isolated Neon branch.",
    );
  }
}

export async function warmGuestChatRoute(fetcher: typeof fetch = fetch) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";
  const response = await fetcher(new URL("/api/guest/chat", appUrl), {
    method: "GET",
  });
  if (response.status >= 500) {
    throw new Error(
      `Failed to warm the guest chat route (${response.status} ${response.statusText})`,
    );
  }
}

export default async function globalSetup() {
  assertEphemeralE2EBranch();
  // Next dev compiles route modules on first access. Compile the chat endpoint
  // before assertion timeouts start so E2E latency measures the flow itself.
  await warmGuestChatRoute();
}
