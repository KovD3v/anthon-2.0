export function assertEphemeralE2EBranch() {
  const ephemeralBranchId = process.env.E2E_EPHEMERAL_BRANCH_ID?.trim();
  if (!ephemeralBranchId?.startsWith("br-")) {
    throw new Error(
      "E2E_EPHEMERAL_BRANCH_ID is required. Run `bun run test:e2e` so the suite uses an isolated Neon branch.",
    );
  }
}

export default function globalSetup() {
  assertEphemeralE2EBranch();
}
