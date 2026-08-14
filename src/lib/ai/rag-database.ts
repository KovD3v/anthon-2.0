import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createDatabasePool } from "@/lib/db-pool";

const PRODUCTION_RAG_DATABASE_ENV = "RAG_PRODUCTION_DATABASE_URL";

type RagReadDatabase = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $transaction<T>(
    operation: (database: RagReadTransaction) => Promise<T>,
  ): Promise<T>;
  ragDocument: {
    count(): Promise<number>;
  };
};

type RagReadOperations = Pick<
  RagReadDatabase,
  "$queryRawUnsafe" | "ragDocument"
>;

type RagReadTransaction = RagReadOperations & {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

const globalForRagDatabase = globalThis as unknown as {
  productionReadDatabase:
    | {
        url: string;
        pool: ReturnType<typeof createDatabasePool>;
        client: RagReadDatabase;
      }
    | undefined;
};

/**
 * Return the optional Production corpus URL for local development only.
 *
 * The explicit NODE_ENV guard prevents this local convenience variable from
 * changing the database used by Preview or Production deployments.
 */
export function getProductionRagDatabaseUrl(): string | undefined {
  if (process.env.NODE_ENV !== "development") {
    return undefined;
  }

  const url = process.env[PRODUCTION_RAG_DATABASE_ENV]?.trim();
  return url || undefined;
}

/**
 * Return the database used by RAG reads.
 *
 * User/chat data and RAG management mutations continue to use `prisma`. When
 * configured locally, only RAG document counts and vector searches use the
 * separate read-only Production connection.
 */
export function getRagReadDatabase(): RagReadDatabase {
  const productionUrl = getProductionRagDatabaseUrl();

  if (!productionUrl) {
    return prisma as unknown as RagReadDatabase;
  }

  const cached = globalForRagDatabase.productionReadDatabase;
  if (cached?.url === productionUrl) {
    return cached.client;
  }

  const pool = createDatabasePool(productionUrl);
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log: ["error"],
  });
  const ragReadClient = client as unknown as RagReadDatabase;

  const database = {
    url: productionUrl,
    pool,
    client: ragReadClient,
  } satisfies (typeof globalForRagDatabase)["productionReadDatabase"];

  globalForRagDatabase.productionReadDatabase = database;
  return ragReadClient;
}

/**
 * Run a RAG read in a transaction that cannot mutate the Production corpus.
 * Neon poolers reject `default_transaction_read_only` startup parameters, so
 * the guard belongs inside the transaction instead.
 */
export async function withRagRead<T>(
  operation: (database: RagReadOperations) => Promise<T>,
): Promise<T> {
  const database = getRagReadDatabase();

  if (!getProductionRagDatabaseUrl()) {
    return operation(database);
  }

  return database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return operation(transaction);
  });
}
