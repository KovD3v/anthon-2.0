/**
 * Runs the local Clerk Backend API and Vercel Blob emulators until Ctrl+C.
 * Prints the env lines that point the SDKs at them (backend calls only).
 */
import { startEmulatedServices } from "../src/test/emulate/services";

const services = await startEmulatedServices({ clerk: 4011, vercel: 4000 });

console.log("Emulate is running. Point the SDKs at it with:\n");
for (const [key, value] of Object.entries(services.env)) {
  console.log(`${key}=${value}`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await services.close();
    process.exit(0);
  });
}
