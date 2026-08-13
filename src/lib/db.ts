import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { createDatabasePool, warmDatabasePool } from "@/lib/db-pool";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";
import { softDeleteExtension } from "./prisma-extensions";

const dbLogger = createLogger("latency");

const globalForDatabase = globalThis as unknown as {
  database: ReturnType<typeof createDatabase> | undefined;
  databaseConnection: Promise<void> | undefined;
};

// Create Prisma client using pg adapter for Prisma 7
function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = createDatabasePool(connectionString);
  const adapter = new PrismaPg(pool);

  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? process.env.LOG_PRISMA_QUERIES === "true"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
  });

  // Apply soft-delete extension
  return {
    pool,
    prisma: client.$extends(softDeleteExtension),
  };
}

// Use globalThis to ensure singleton across hot reloads
const database = globalForDatabase.database ?? createDatabase();
globalForDatabase.database = database;

export const prisma = database.prisma;

export function connectDatabase() {
  globalForDatabase.databaseConnection ??= (async () => {
    await prisma.$connect();
    await warmDatabasePool(database.pool);
  })().catch((error) => {
    globalForDatabase.databaseConnection = undefined;
    throw error;
  });
  return globalForDatabase.databaseConnection;
}

export async function warmDatabaseConnection(reason: string) {
  try {
    await LatencyLogger.measure("DB: Warm connection", connectDatabase);
  } catch (error) {
    dbLogger.warn("db.warm_connection_failed", "Database warm-up failed", {
      error,
      reason,
    });
  }
}
