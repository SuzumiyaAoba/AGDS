import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../migration-runner.js";

const MIGRATIONS_DIR = join(
  new URL("../../migrations", import.meta.url).pathname,
);

describe("loadMigrations", () => {
  it("loads at least one migration from the migrations directory", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(1);
  });

  it("parses the version number correctly", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    expect(migrations[0]?.version).toBe(1);
  });

  it("parses the migration name", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    expect(migrations[0]?.name).toBe("initial-schema");
  });

  it("migration cypher contains constraint statements", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const cypher = migrations[0]?.cypher ?? "";
    expect(cypher).toContain("CREATE CONSTRAINT");
  });

  it("returns migrations sorted by version", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });
});
