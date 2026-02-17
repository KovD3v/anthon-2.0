import globalSetup from "./global-setup";

const globalForIntegrationSetup = globalThis as unknown as {
  __integrationDbSetupPromise?: Promise<void>;
};

if (!globalForIntegrationSetup.__integrationDbSetupPromise) {
  globalForIntegrationSetup.__integrationDbSetupPromise = globalSetup().then(
    () => undefined,
  );
}

await globalForIntegrationSetup.__integrationDbSetupPromise;
