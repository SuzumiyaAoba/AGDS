import { Neo4jGraphStore } from "@agds/adapter-neo4j";
import { FsDocumentStore } from "@agds/adapter-store-fs";
import type { AgdsConfig } from "./config.js";
import { FetchService } from "./fetch-service.js";
import { NavigationService } from "./navigation-service.js";
import { QueryService } from "./query-service.js";
import { ResolveService } from "./resolve-service.js";
import { SyncService } from "./sync-service.js";
import { VerifyService } from "./verify-service.js";

export interface AgdsServices {
  readonly graph: Neo4jGraphStore;
  readonly store: FsDocumentStore;
  readonly sync: SyncService;
  readonly verify: VerifyService;
  readonly resolve: ResolveService;
  readonly fetch: FetchService;
  readonly navigation: NavigationService;
  readonly query: QueryService;
  /** Release the Neo4j driver connection pool. Call on shutdown. */
  close(): Promise<void>;
}

/**
 * Composition root for AGDS.
 *
 * Wires infrastructure adapters (Neo4j, FS) to the core service layer and
 * returns a ready-to-use `AgdsServices` bundle. Callers must call `close()`
 * when the process exits to release the Neo4j driver.
 *
 * @param config  Validated AGDS configuration.
 * @param holder  Identifier for the current process / session, used in advisory locks.
 *                Defaults to the string representation of `process.pid`.
 */
export function createAgds(
  config: AgdsConfig,
  holder?: string,
): AgdsServices {
  const lockHolder = holder ?? String(process.pid);

  const fsOpts: import("@agds/adapter-store-fs").FsDocumentStoreOptions = {
    storeId: "fs",
    vaultRoot: config.vault.root,
  };
  if (config.vault.extensions !== undefined) fsOpts.extensions = config.vault.extensions;
  if (config.vault.excludeDirs !== undefined) fsOpts.excludeDirs = config.vault.excludeDirs;
  const store = new FsDocumentStore(fsOpts);

  const neo4jOpts: import("@agds/adapter-neo4j").Neo4jGraphStoreOptions = {
    url: config.neo4j.url ?? "bolt://localhost:7687",
    username: config.neo4j.username ?? "neo4j",
    password: config.neo4j.password,
  };
  if (config.neo4j.database !== undefined) neo4jOpts.database = config.neo4j.database;
  const graph = new Neo4jGraphStore(neo4jOpts);

  const vaultId = config.vaultId;
  const now = (): Date => new Date();

  return {
    graph,
    store,
    sync: new SyncService({ vaultId, store, graph, holder: lockHolder, now }),
    verify: new VerifyService({ vaultId, graph }),
    resolve: new ResolveService({ vaultId, graph }),
    fetch: new FetchService({ vaultId, graph, store }),
    navigation: new NavigationService({ vaultId, graph }),
    query: new QueryService({ graph }),
    close: () => graph.close(),
  };
}
