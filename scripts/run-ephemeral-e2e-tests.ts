import { runEphemeralE2ETests } from "./run-ephemeral-integration-tests";

try {
  process.exitCode = await runEphemeralE2ETests(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[e2e] ${message}`);
  process.exitCode = 1;
}
