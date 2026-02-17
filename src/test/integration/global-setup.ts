import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

export default async function globalSetup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests. Refusing to run against DATABASE_URL.",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
  process.env.INTEGRATION_TEST_SCHEMA = "public";

  // Ensure pgvector exists before syncing schema.
  const extensionClient = new Client({ connectionString: testDatabaseUrl });
  try {
    await extensionClient.connect();
    await extensionClient.query("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await extensionClient.end().catch(() => {});
  }

  execSync("./node_modules/.bin/prisma db push", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DIRECT_DATABASE_URL: testDatabaseUrl,
    },
  });

  return async () => {};
}
