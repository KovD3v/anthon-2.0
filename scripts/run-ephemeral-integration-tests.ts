import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { Client } from "pg";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const BRANCH_TTL_MS = 2 * 60 * 60 * 1000;
const DATABASE_READY_TIMEOUT_MS = 90_000;

type NeonEndpoint = {
  id: string;
  branch_id: string;
  host: string;
  type: "read_write" | "read_only";
};

export type NeonBranch = {
  id: string;
  name: string;
  default?: boolean;
  primary?: boolean;
  protected?: boolean;
};

type CreatedBranch = {
  branch: NeonBranch;
  endpoints: NeonEndpoint[];
};

type FetchLike = typeof fetch;

export class NeonBranchApi {
  constructor(
    private readonly apiKey: string,
    private readonly projectId: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(
      `${NEON_API_BASE}/projects/${this.projectId}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `Neon API request failed (${init.method ?? "GET"} ${path}, ${response.status} ${response.statusText})`,
      );
    }
    return (await response.json()) as T;
  }

  async listEndpoints() {
    const result = await this.request<{ endpoints: NeonEndpoint[] }>(
      "/endpoints",
    );
    return result.endpoints;
  }

  async listBranches() {
    const result = await this.request<{ branches: NeonBranch[] }>("/branches");
    return result.branches;
  }

  async createBranch({
    name,
    parentId,
    expiresAt,
  }: {
    name: string;
    parentId: string;
    expiresAt: Date;
  }) {
    return this.request<CreatedBranch>("/branches", {
      method: "POST",
      body: JSON.stringify({
        branch: {
          name,
          parent_id: parentId,
          expires_at: expiresAt.toISOString(),
        },
        endpoints: [{ type: "read_write" }],
      }),
    });
  }

  async deleteBranch(branchId: string) {
    await this.request(`/branches/${branchId}`, { method: "DELETE" });
  }
}

export function getEndpointId(connectionString: string) {
  const hostname = new URL(connectionString).hostname;
  const endpointId = hostname.split(".")[0]?.replace(/-pooler$/, "");
  if (!endpointId?.startsWith("ep-")) {
    throw new Error(
      "DATABASE_URL must point to a Neon endpoint so the development branch can be identified.",
    );
  }
  return endpointId;
}

export function assertDevelopmentParent(
  branch: NeonBranch | undefined,
  endpointBranchId: string,
) {
  if (!branch || branch.id !== endpointBranchId) {
    throw new Error(
      "The Neon branch backing DATABASE_URL was not found in NEON_PROJECT_ID.",
    );
  }
  if (
    branch.name !== "development" ||
    branch.default ||
    branch.primary ||
    branch.protected ||
    /^(main|production)$/i.test(branch.name)
  ) {
    throw new Error(
      `Refusing to derive integration tests from protected/default branch ${branch.name}. DATABASE_URL must point to development.`,
    );
  }
}

export function buildEphemeralConnectionString(
  developmentConnectionString: string,
  endpointHost: string,
) {
  const connection = new URL(developmentConnectionString);
  connection.hostname = endpointHost;
  connection.searchParams.delete("pgbouncer");
  return connection.toString();
}

export function buildEphemeralBranchName(
  now = new Date(),
  prefix = "integration",
) {
  const timestamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

export function buildChildProcessEnv(env: NodeJS.ProcessEnv) {
  const childEnv = { ...env };
  delete childEnv.NEON_API_KEY;
  delete childEnv.TEST_DATABASE_URL;
  delete childEnv.INTEGRATION_EPHEMERAL_BRANCH_ID;
  delete childEnv.E2E_EPHEMERAL_BRANCH_ID;
  return childEnv;
}

export function buildE2EProcessEnv({
  childProcessEnv,
  testDatabaseUrl,
  branchId,
}: {
  childProcessEnv: NodeJS.ProcessEnv;
  testDatabaseUrl: string;
  branchId: string;
}) {
  return {
    ...childProcessEnv,
    DATABASE_URL: testDatabaseUrl,
    DIRECT_DATABASE_URL: testDatabaseUrl,
    E2E_EPHEMERAL_BRANCH_ID: branchId,
    OPENROUTER_API_KEY: "e2e-local-key",
    OPENROUTER_BASE_URL: "http://127.0.0.1:4317/api/v1",
    NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    // Every Playwright test gets a fresh guest, while all local requests share
    // the same development-only abuse identity. Keep production's cap intact.
    GUEST_CREATIONS_PER_IP_PER_DAY: "100",
  } satisfies NodeJS.ProcessEnv;
}

function redactSecrets(message: string) {
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<redacted-db-url>");
}

function errorMessage(error: unknown) {
  return redactSecrets(error instanceof Error ? error.message : String(error));
}

async function waitForDatabase(
  connectionString: string,
  wasInterrupted: () => boolean,
) {
  const deadline = Date.now() + DATABASE_READY_TIMEOUT_MS;
  let lastError = "database is not ready";
  while (Date.now() < deadline && !wasInterrupted()) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return;
    } catch (error) {
      lastError = errorMessage(error);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (wasInterrupted()) throw new Error("Integration run interrupted");
  throw new Error(`Ephemeral Neon compute did not become ready: ${lastError}`);
}

let activeChild: ChildProcess | null = null;

async function runCommand(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = null;
      if (signal) {
        reject(new Error(`Command interrupted by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

interface EphemeralRunContext {
  branch: NeonBranch;
  childProcessEnv: NodeJS.ProcessEnv;
  developmentUrl: string;
  testDatabaseUrl: string;
}

async function runOnEphemeralNeon({
  branchPrefix,
  label,
  run,
}: {
  branchPrefix: string;
  label: string;
  run: (context: EphemeralRunContext) => Promise<number>;
}) {
  const apiKey = process.env.NEON_API_KEY?.trim();
  const projectId = process.env.NEON_PROJECT_ID?.trim();
  const developmentUrl = process.env.DATABASE_URL?.trim();
  if (!apiKey || !projectId || !developmentUrl) {
    throw new Error(
      `NEON_API_KEY, NEON_PROJECT_ID, and development DATABASE_URL are required for ${label} tests.`,
    );
  }
  if (process.env.TEST_DATABASE_URL) {
    throw new Error(
      `Do not persist TEST_DATABASE_URL. The ${label} runner creates and injects an ephemeral Neon branch.`,
    );
  }

  const api = new NeonBranchApi(apiKey, projectId);
  const developmentEndpointId = getEndpointId(developmentUrl);
  const [endpoints, branches] = await Promise.all([
    api.listEndpoints(),
    api.listBranches(),
  ]);
  const developmentEndpoint = endpoints.find(
    (endpoint) => endpoint.id === developmentEndpointId,
  );
  if (!developmentEndpoint) {
    throw new Error(
      "DATABASE_URL endpoint does not belong to NEON_PROJECT_ID.",
    );
  }
  const parent = branches.find(
    (branch) => branch.id === developmentEndpoint.branch_id,
  );
  assertDevelopmentParent(parent, developmentEndpoint.branch_id);

  const branchName = buildEphemeralBranchName(new Date(), branchPrefix);
  const childProcessEnv = buildChildProcessEnv(process.env);
  let ephemeralBranch: CreatedBranch | null = null;
  let cleanupError: Error | null = null;
  let testExitCode = 1;
  let interruptedSignal: NodeJS.Signals | null = null;
  const handleSignal = (signal: NodeJS.Signals) => {
    interruptedSignal = signal;
    activeChild?.kill(signal);
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    ephemeralBranch = await api.createBranch({
      name: branchName,
      parentId: developmentEndpoint.branch_id,
      expiresAt: new Date(Date.now() + BRANCH_TTL_MS),
    });
    const readWriteEndpoint = ephemeralBranch.endpoints.find(
      (endpoint) => endpoint.type === "read_write",
    );
    if (!readWriteEndpoint) {
      throw new Error(
        "Neon did not create a read-write compute for the branch.",
      );
    }
    console.log(
      `[${label}] Created ephemeral Neon branch ${ephemeralBranch.branch.name} (${ephemeralBranch.branch.id}) from ${parent?.name}.`,
    );
    const testDatabaseUrl = buildEphemeralConnectionString(
      developmentUrl,
      readWriteEndpoint.host,
    );
    await waitForDatabase(testDatabaseUrl, () => Boolean(interruptedSignal));

    const prismaExitCode = await runCommand(
      join(process.cwd(), "node_modules/.bin/prisma"),
      ["migrate", "deploy"],
      {
        ...childProcessEnv,
        DATABASE_URL: testDatabaseUrl,
        DIRECT_DATABASE_URL: testDatabaseUrl,
      },
    );
    if (prismaExitCode !== 0) {
      throw new Error(
        `Prisma migration failed with exit code ${prismaExitCode}`,
      );
    }

    testExitCode = await run({
      branch: ephemeralBranch.branch,
      childProcessEnv,
      developmentUrl,
      testDatabaseUrl,
    });
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    if (ephemeralBranch) {
      try {
        await api.deleteBranch(ephemeralBranch.branch.id);
        console.log(
          `[${label}] Deleted ephemeral Neon branch ${ephemeralBranch.branch.name} (${ephemeralBranch.branch.id}).`,
        );
      } catch (error) {
        cleanupError = new Error(
          `Failed to delete ephemeral branch ${ephemeralBranch.branch.id}: ${errorMessage(error)}. Neon expiration remains configured as a backstop.`,
        );
      }
    }
  }

  if (cleanupError) throw cleanupError;
  if (interruptedSignal) {
    throw new Error(`${label} run interrupted by ${interruptedSignal}`);
  }
  return testExitCode;
}

export async function runEphemeralIntegrationTests(testArgs: string[] = []) {
  return runOnEphemeralNeon({
    branchPrefix: "integration",
    label: "integration",
    run: ({ branch, childProcessEnv, developmentUrl, testDatabaseUrl }) =>
      runCommand(
        join(process.cwd(), "node_modules/.bin/vitest"),
        ["run", "-c", "vitest.integration.config.ts", ...testArgs],
        {
          ...childProcessEnv,
          DATABASE_URL: developmentUrl,
          TEST_DATABASE_URL: testDatabaseUrl,
          INTEGRATION_EPHEMERAL_BRANCH_ID: branch.id,
        },
      ),
  });
}

export async function runEphemeralE2ETests(testArgs: string[] = []) {
  return runOnEphemeralNeon({
    branchPrefix: "e2e",
    label: "e2e",
    run: ({ branch, childProcessEnv, testDatabaseUrl }) =>
      runCommand(
        join(process.cwd(), "node_modules/.bin/playwright"),
        ["test", ...testArgs],
        buildE2EProcessEnv({
          childProcessEnv,
          testDatabaseUrl,
          branchId: branch.id,
        }),
      ),
  });
}

if (import.meta.main) {
  try {
    process.exitCode = await runEphemeralIntegrationTests(
      process.argv.slice(2),
    );
  } catch (error) {
    console.error(`[integration] ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}
