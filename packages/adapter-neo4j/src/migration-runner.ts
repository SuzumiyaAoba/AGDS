import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Session } from "neo4j-driver";
import { GET_SCHEMA_VERSION, SET_SCHEMA_VERSION } from "./cypher.js";

/** A single numbered migration file. */
export interface Migration {
  version: number;
  name: string;
  cypher: string;
}

/**
 * Load all `.cypher` migration files from the given directory.
 * Files must be named `<NNNN>-<slug>.cypher` (4-digit zero-padded version).
 */
export async function loadMigrations(migrationsDir: string): Promise<Migration[]> {
  const absDir = resolve(migrationsDir);
  const entries = await readdir(absDir);
  const migrations: Migration[] = [];

  for (const entry of entries.sort()) {
    if (!entry.endsWith(".cypher")) continue;
    const match = /^(\d{4})-(.+)\.cypher$/.exec(entry);
    if (match === null) continue;
    const version = parseInt(match[1] ?? "0", 10);
    const name = match[2] ?? entry;
    const cypher = await readFile(join(absDir, entry), "utf8");
    migrations.push({ version, name, cypher });
  }

  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Read the current schema version from the graph.
 * Returns 0 when no version record exists.
 */
export async function getCurrentVersion(session: Session): Promise<number> {
  const result = await session.run(GET_SCHEMA_VERSION);
  const record = result.records[0];
  if (record === undefined) return 0;
  const raw = record.get("version");
  return typeof raw === "number" ? raw : 0;
}

/**
 * Apply all pending migrations in order.
 *
 * Each migration's statements are executed individually (Neo4j does not
 * support multi-statement transactions in a single `session.run` call).
 * The schema version is bumped after every successful migration.
 *
 * @param session     An open Neo4j write session.
 * @param migrations  All available migrations (sorted by version).
 */
export async function applyPendingMigrations(
  session: Session,
  migrations: Migration[],
): Promise<{ applied: number[] }> {
  const current = await getCurrentVersion(session);
  const pending = migrations.filter((m) => m.version > current);
  const applied: number[] = [];

  for (const migration of pending) {
    // Split on semicolons to run each statement individually.
    const statements = migration.cypher
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("//"));

    for (const stmt of statements) {
      await session.run(stmt);
    }

    await session.run(SET_SCHEMA_VERSION, { version: migration.version });
    applied.push(migration.version);
  }

  return { applied };
}
