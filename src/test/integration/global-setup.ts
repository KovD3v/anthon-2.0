import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getHostFromConnectionString(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "<invalid-url>";
  }
}

function toPoolerConnectionString(connectionString: string): string | null {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname;

    if (host.includes("-pooler.")) {
      return null;
    }

    const neonSegmentIndex = host.indexOf(".c-");
    if (neonSegmentIndex === -1) {
      return null;
    }

    parsed.hostname = `${host.slice(0, neonSegmentIndex)}-pooler${host.slice(neonSegmentIndex)}`;
    return parsed.toString();
  } catch {
    return null;
  }
}

function assertNotProductionDatabase(
  testUrl: string,
  productionUrl: string | undefined,
): void {
  if (!productionUrl) return; // No production URL configured — skip check
  const testHost = getHostFromConnectionString(testUrl);
  const prodHost = getHostFromConnectionString(productionUrl);
  // Strip pooler suffix for comparison: ep-foo-pooler.x.y == ep-foo.x.y
  const normalize = (h: string) => h.replace(/-pooler\./, ".");
  if (normalize(testHost) === normalize(prodHost)) {
    throw new Error(
      `[integration setup] TEST_DATABASE_URL resolves to the same host as DATABASE_URL.\n` +
        `Refusing to run integration tests against the production database.\n` +
        `TEST_DATABASE_URL host: ${testHost}\n` +
        `DATABASE_URL host: ${prodHost}`,
    );
  }
}

async function assertDbReachable(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => {});
  }
}

async function resolveReachableConnectionString(
  configuredConnectionString: string,
): Promise<string> {
  const fallbackPooler = toPoolerConnectionString(configuredConnectionString);
  const candidates = Array.from(
    new Set(
      [configuredConnectionString, fallbackPooler].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );

  const errors: Array<{ host: string; reason: string }> = [];

  for (const candidate of candidates) {
    try {
      await assertDbReachable(candidate);
      return candidate;
    } catch (error) {
      errors.push({
        host: getHostFromConnectionString(candidate),
        reason: getErrorMessage(error),
      });
    }
  }

  const details = errors
    .map((item) => `${item.host}: ${item.reason}`)
    .join(" | ");

  throw new Error(
    `Unable to reach integration database via TEST_DATABASE_URL. ${details}`,
  );
}

async function ensureVectorExtension(connectionString: string): Promise<void> {
  const extensionClient = new Client({ connectionString });
  try {
    await extensionClient.connect();
    await extensionClient.query("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await extensionClient.end().catch(() => {});
  }
}

function runPrismaDbPush(connectionString: string): void {
  execSync("./node_modules/.bin/prisma db push", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      DIRECT_DATABASE_URL: connectionString,
    },
  });
}

export default async function globalSetup() {
  const configuredTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!configuredTestDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests. Refusing to run against DATABASE_URL.",
    );
  }

  // Guard: refuse to run if TEST_DATABASE_URL points at the production DB
  assertNotProductionDatabase(
    configuredTestDatabaseUrl,
    process.env.DATABASE_URL,
  );

  const testDatabaseUrl = await resolveReachableConnectionString(
    configuredTestDatabaseUrl,
  );

  if (testDatabaseUrl !== configuredTestDatabaseUrl) {
    console.warn(
      `[integration setup] Falling back to pooled Neon host ${getHostFromConnectionString(testDatabaseUrl)} for integration tests.`,
    );
  }

  process.env.TEST_DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
  process.env.INTEGRATION_TEST_SCHEMA = "public";

  try {
    await ensureVectorExtension(testDatabaseUrl);
  } catch (error) {
    throw new Error(
      `Integration setup failed while enabling pgvector on ${getHostFromConnectionString(
        testDatabaseUrl,
      )}: ${getErrorMessage(error)}`,
    );
  }

  runPrismaDbPush(testDatabaseUrl);

  return async () => {};
}
