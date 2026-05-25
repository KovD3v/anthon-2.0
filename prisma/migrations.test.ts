import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(__dirname, "migrations");

function allMigrationSql() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      readFileSync(join(migrationsDir, entry.name, "migration.sql"), "utf8"),
    )
    .join("\n");
}

describe("database migrations", () => {
  it("creates Chat.customTitle required by the Prisma schema", () => {
    expect(allMigrationSql()).toMatch(/"customTitle"\s+BOOLEAN\s+NOT NULL/i);
  });
});
