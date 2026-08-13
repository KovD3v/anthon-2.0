import { describe, expect, it, vi } from "vitest";
import { createDatabasePool, warmDatabasePool } from "./db-pool";

describe("createDatabasePool", () => {
  it("registers PostgreSQL connection releases with the function runtime", async () => {
    const pool = createDatabasePool(
      "postgresql://user:password@localhost:5432/anthon_test",
    );

    expect(pool.listenerCount("release")).toBe(1);

    await pool.end();
  });

  it("opens enough physical connections for Prisma relation reads", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await warmDatabasePool({ query }, 3);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(1, "SELECT 1");
    expect(query).toHaveBeenNthCalledWith(2, "SELECT 1");
    expect(query).toHaveBeenNthCalledWith(3, "SELECT 1");
  });
});
