import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  primaryDatabase: {
    ragDocument: { count: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
  createDatabasePool: vi.fn(),
  PrismaPg: vi.fn(),
  PrismaClient: vi.fn(),
  productionClient: {
    ragDocument: { count: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.primaryDatabase }));
vi.mock("@/lib/db-pool", () => ({
  createDatabasePool: mocks.createDatabasePool,
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: mocks.PrismaPg }));
vi.mock("@/generated/prisma", () => ({ PrismaClient: mocks.PrismaClient }));

async function loadModule() {
  return await import("./rag-database");
}

describe("ai/rag-database", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();

    delete (
      globalThis as {
        productionReadDatabase?: unknown;
      }
    ).productionReadDatabase;

    mocks.createDatabasePool.mockReset();
    mocks.PrismaPg.mockReset();
    mocks.PrismaClient.mockReset();
    mocks.createDatabasePool.mockReturnValue({ pool: "production" });
    mocks.PrismaPg.mockImplementation(
      class MockPrismaPg {
        readonly pool: unknown;

        constructor(pool: unknown) {
          this.pool = pool;
        }
      } as unknown as (...args: unknown[]) => unknown,
    );
    mocks.PrismaClient.mockImplementation(
      class MockPrismaClient {
        readonly ragDocument = mocks.productionClient.ragDocument;
        readonly $queryRawUnsafe = mocks.productionClient.$queryRawUnsafe;
        readonly $transaction = mocks.productionClient.$transaction;
      } as unknown as (...args: unknown[]) => unknown,
    );
  });

  it("does not enable the Production corpus outside local development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "RAG_PRODUCTION_DATABASE_URL",
      "postgresql://production.example/rag",
    );
    const { getProductionRagDatabaseUrl, getRagReadDatabase } =
      await loadModule();

    expect(getProductionRagDatabaseUrl()).toBeUndefined();
    expect(getRagReadDatabase()).toBe(mocks.primaryDatabase);
    expect(mocks.createDatabasePool).not.toHaveBeenCalled();
  });

  it("uses the primary database when no local Production corpus is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getProductionRagDatabaseUrl, getRagReadDatabase } =
      await loadModule();

    expect(getProductionRagDatabaseUrl()).toBeUndefined();
    expect(getRagReadDatabase()).toBe(mocks.primaryDatabase);
  });

  it("creates and reuses a read-only Production corpus client locally", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "RAG_PRODUCTION_DATABASE_URL",
      "  postgresql://production.example/rag  ",
    );
    const { getProductionRagDatabaseUrl, getRagReadDatabase } =
      await loadModule();

    expect(getProductionRagDatabaseUrl()).toBe(
      "postgresql://production.example/rag",
    );
    const productionDatabase = getRagReadDatabase();
    expect(productionDatabase).toMatchObject({
      ragDocument: mocks.productionClient.ragDocument,
      $queryRawUnsafe: mocks.productionClient.$queryRawUnsafe,
      $transaction: mocks.productionClient.$transaction,
    });
    expect(getRagReadDatabase()).toBe(productionDatabase);
    expect(mocks.createDatabasePool).toHaveBeenCalledTimes(1);
    expect(mocks.createDatabasePool).toHaveBeenCalledWith(
      "postgresql://production.example/rag",
    );
    expect(mocks.PrismaPg).toHaveBeenCalledWith({ pool: "production" });
    expect(mocks.PrismaClient).toHaveBeenCalledWith({
      adapter: expect.objectContaining({ pool: { pool: "production" } }),
      log: ["error"],
    });
  });

  it("wraps local Production corpus reads in a read-only transaction", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "RAG_PRODUCTION_DATABASE_URL",
      "postgresql://production.example/rag",
    );
    const transaction = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      ragDocument: { count: vi.fn().mockResolvedValue(40) },
      $queryRawUnsafe: vi.fn(),
    };
    mocks.productionClient.$transaction.mockImplementation(
      async (operation: (database: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    );
    const { withRagRead } = await loadModule();

    await expect(
      withRagRead((database) => database.ragDocument.count()),
    ).resolves.toBe(40);
    expect(mocks.productionClient.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET TRANSACTION READ ONLY",
    );
  });
});
