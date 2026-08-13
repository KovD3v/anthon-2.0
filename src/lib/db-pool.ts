import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

export function createDatabasePool(connectionString: string) {
  const pool = new Pool({ connectionString });
  attachDatabasePool(pool);
  return pool;
}

export async function warmDatabasePool(
  pool: { query(sql: string): Promise<unknown> },
  connectionCount = 3,
) {
  await Promise.all(
    Array.from({ length: connectionCount }, () => pool.query("SELECT 1")),
  );
}
