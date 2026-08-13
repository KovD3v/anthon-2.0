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

  it("creates the ChatIcon enum and a required Chat.icon fallback", () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/CREATE TYPE "ChatIcon" AS ENUM/i);
    expect(sql).toMatch(
      /ADD COLUMN "icon" "ChatIcon" NOT NULL DEFAULT 'MESSAGE_SQUARE'/i,
    );
  });

  it("repairs Memory.category drift idempotently", () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(
      /ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS\s+"category"\s+TEXT\s+NOT NULL\s+DEFAULT 'other'/i,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS "Memory_userId_category_idx"/i,
    );
  });

  it("creates ArchivedSession idempotently for drifted databases", () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "ArchivedSession"/i);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS "ArchivedSession_userId_startDate_idx"/i,
    );
    expect(sql).toMatch(/ArchivedSession_userId_fkey/i);
  });

  it("removes retired artifact and message activity storage", () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/DROP TABLE IF EXISTS "ArtifactVersion"/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS "Artifact"/i);
    expect(sql).toMatch(/DROP TYPE IF EXISTS "ArtifactKind"/i);
    expect(sql).toMatch(
      /ALTER TABLE "User" DROP COLUMN IF EXISTS "lastActivityAt"/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE "Message" DROP COLUMN IF EXISTS "reasoningContent"/i,
    );
  });
});
