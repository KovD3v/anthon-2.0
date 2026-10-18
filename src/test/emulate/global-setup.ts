import { startEmulatedServices } from "./services";

/**
 * Starts the emulators before Vitest spawns workers, so every worker inherits
 * the redirected SDK environment through process.env.
 */
export default async function setup() {
  const services = await startEmulatedServices();
  Object.assign(process.env, services.env);
  // Keep tests offline and deterministic even when the shell exports real keys.
  delete process.env.OPENROUTER_API_KEY;
  return services.close;
}
