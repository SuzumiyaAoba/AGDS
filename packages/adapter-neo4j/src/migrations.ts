import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Return the absolute path to the bundled Neo4j migration files.
 *
 * The path is resolved relative to this module so it works correctly both
 * in the TypeScript source tree and in the compiled `dist/` output.
 */
export function getMigrationsDir(): string {
  return join(fileURLToPath(import.meta.url), "..", "..", "migrations");
}
