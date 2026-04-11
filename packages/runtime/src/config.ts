/**
 * Typed configuration contract for the AGDS composition root.
 *
 * Callers (CLI, HTTP server, MCP) are responsible for loading raw config
 * from disk/env and parsing it into this shape before calling `createAgds`.
 */
import { z } from "zod";

export const AgdsVaultConfigSchema = z.object({
  /** Absolute path to the vault root directory. */
  root: z.string().min(1),
  /** File extensions to include in the vault. Defaults to `[".md"]`. */
  extensions: z.array(z.string()).optional(),
  /** Directory names to exclude during scan. Defaults to `["node_modules", ".git"]`. */
  excludeDirs: z.array(z.string()).optional(),
});
export type AgdsVaultConfig = z.infer<typeof AgdsVaultConfigSchema>;

export const AgdsNeo4jConfigSchema = z.object({
  /** Bolt connection URI. Defaults to `"bolt://localhost:7687"`. */
  url: z.string().optional(),
  /** Neo4j username. Defaults to `"neo4j"`. */
  username: z.string().optional(),
  /** Neo4j password. */
  password: z.string().min(1),
  /** Neo4j database name. Defaults to `"neo4j"`. */
  database: z.string().optional(),
});
export type AgdsNeo4jConfig = z.infer<typeof AgdsNeo4jConfigSchema>;

export const AgdsConfigSchema = z.object({
  /** Logical vault identifier. Used in all graph queries and edge routing. */
  vaultId: z.string().min(1),
  vault: AgdsVaultConfigSchema,
  neo4j: AgdsNeo4jConfigSchema,
});
export type AgdsConfig = z.infer<typeof AgdsConfigSchema>;
