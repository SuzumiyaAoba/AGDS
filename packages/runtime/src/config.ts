/**
 * Typed configuration contract for the AGDS composition root.
 *
 * Callers (CLI, HTTP server, MCP) are responsible for loading raw config
 * from disk/env and parsing it into this shape before calling `createAgds`.
 */
export interface AgdsVaultConfig {
  /** Absolute path to the vault root directory. */
  root: string;
  /** File extensions to include in the vault. Defaults to `[".md"]`. */
  extensions?: string[];
  /** Directory names to exclude during scan. Defaults to `["node_modules", ".git"]`. */
  excludeDirs?: string[];
}

export interface AgdsNeo4jConfig {
  /** Bolt connection URI. Defaults to `"bolt://localhost:7687"`. */
  url?: string;
  /** Neo4j username. Defaults to `"neo4j"`. */
  username?: string;
  /** Neo4j password. */
  password: string;
  /** Neo4j database name. Defaults to `"neo4j"`. */
  database?: string;
}

export interface AgdsConfig {
  /** Logical vault identifier. Used in all graph queries and edge routing. */
  vaultId: string;
  vault: AgdsVaultConfig;
  neo4j: AgdsNeo4jConfig;
}
