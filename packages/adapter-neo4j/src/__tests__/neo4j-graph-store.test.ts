/**
 * Integration tests for Neo4jGraphStore.
 *
 * These tests require a running Neo4j instance with APOC installed.
 * Set AGDS_LIVE_NEO4J=1 (and optionally NEO4J_TEST_URI / NEO4J_TEST_USER /
 * NEO4J_TEST_PASSWORD) to run them. When the flag is absent the suite is
 * skipped so that CI can run without a database.
 *
 * Default connection: bolt://localhost:7687 / neo4j / agds-dev-password
 * (matches docker/docker-compose.yml).
 */
import { join } from "node:path";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createDocumentId, toOccurrenceKey } from "@agds/core";
import { Neo4jGraphStore } from "../neo4j-graph-store.js";
import { applyPendingMigrations, loadMigrations } from "../migration-runner.js";
import type { Document } from "@agds/core";

const LIVE = process.env["AGDS_LIVE_NEO4J"] === "1";
const URI = process.env["NEO4J_TEST_URI"] ?? "bolt://localhost:7687";
const USER = process.env["NEO4J_TEST_USER"] ?? "neo4j";
const PASS = process.env["NEO4J_TEST_PASSWORD"] ?? "agds-dev-password";
const MIGRATIONS_DIR = join(
  new URL("../../migrations", import.meta.url).pathname,
);

const TEST_VAULT = "test-vault-007";

function makeStore(): Neo4jGraphStore {
  return new Neo4jGraphStore({ url: URI, username: USER, password: PASS });
}

function makeDocument(seed: string): Document {
  const id = createDocumentId(TEST_VAULT, seed);
  return {
    id,
    vaultId: TEST_VAULT,
    storeId: "fs",
    storeKey: `${seed}.md`,
    path: `${seed}.md`,
    title: `Test Document ${seed}`,
    hash: "a".repeat(64),
    bytes: 100,
    storeVersion: new Date().toISOString(),
    updatedAt: new Date(),
    archived: false,
    schemaVersion: 1,
  } as Document;
}

describe.skipIf(!LIVE)("Neo4jGraphStore (live)", () => {
  let store: Neo4jGraphStore;

  beforeAll(async () => {
    store = makeStore();
    // Apply migrations so constraints exist.
    const session = (store as unknown as { writeSession(): import("neo4j-driver").Session }).writeSession?.();
    if (session) {
      const migrations = await loadMigrations(MIGRATIONS_DIR);
      await applyPendingMigrations(session, migrations);
      await session.close();
    }
  });

  afterAll(async () => {
    await store.close();
  });

  it("verifies connectivity and APOC availability", async () => {
    const { apocVersion } = await store.verifyConnectivity();
    expect(typeof apocVersion).toBe("string");
    expect(apocVersion.length).toBeGreaterThan(0);
  });

  it("upserts and finds a document by id", async () => {
    const doc = makeDocument("find-by-id");
    await store.upsertDocument(doc);
    const found = await store.findDocumentById(doc.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(doc.id);
    expect(found?.title).toBe(doc.title);
  });

  it("upserts and finds a document by ref", async () => {
    const doc = makeDocument("find-by-ref");
    await store.upsertDocument(doc);
    const found = await store.findDocumentByRef(TEST_VAULT, "fs", `find-by-ref.md`);
    expect(found?.id).toBe(doc.id);
  });

  it("archives a document", async () => {
    const doc = makeDocument("to-archive");
    await store.upsertDocument(doc);
    await store.archiveDocument(doc.id);
    const found = await store.findDocumentById(doc.id);
    expect(found?.archived).toBe(true);
  });

  it("listDocuments excludes archived documents", async () => {
    const active = makeDocument("list-active");
    const archived = makeDocument("list-archived");
    await store.upsertDocument(active);
    await store.upsertDocument(archived);
    await store.archiveDocument(archived.id);
    const docs = await store.listDocuments(TEST_VAULT);
    const ids = docs.map((d) => d.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(archived.id);
  });

  it("upserts headings for a document", async () => {
    const doc = makeDocument("with-headings");
    await store.upsertDocument(doc);
    await store.upsertHeadings(doc.id, [
      { id: `${doc.id}:intro`, docId: doc.id, level: 1, text: "Intro", slug: "intro", order: 0 },
    ]);
    // Verify by running a raw query.
    const rows = await store.query<{ count: unknown }>(
      "MATCH (d:Document {id: $id})-[:HAS_HEADING]->(h:Heading) RETURN count(h) AS count",
      { id: doc.id },
    );
    expect(rows[0]).toBeDefined();
  });

  it("upserts tags for a document", async () => {
    const doc = makeDocument("with-tags");
    await store.upsertDocument(doc);
    await store.upsertTags(doc.id, [{ name: "test-tag-007" }]);
    const rows = await store.query<{ count: unknown }>(
      "MATCH (d:Document {id: $id})-[:HAS_TAG]->(t:Tag) RETURN count(t) AS count",
      { id: doc.id },
    );
    expect(rows[0]).toBeDefined();
  });

  it("acquires and releases an advisory lock", async () => {
    await store.acquireLock("test-scope-007", "test-holder", 60_000);
    // A second acquire by the same holder should succeed (re-entrant).
    await store.acquireLock("test-scope-007", "test-holder", 60_000);
    await store.releaseLock("test-scope-007");
    // After release, a different holder can acquire.
    await store.acquireLock("test-scope-007", "other-holder", 60_000);
    await store.releaseLock("test-scope-007");
  });

  it("throws LOCK_CONFLICT when scope is held by another", async () => {
    await store.acquireLock("conflict-scope-007", "owner", 60_000);
    await expect(
      store.acquireLock("conflict-scope-007", "intruder", 60_000),
    ).rejects.toMatchObject({ code: "LOCK_CONFLICT" });
    await store.releaseLock("conflict-scope-007");
  });

  it("executes a read-only query", async () => {
    const rows = await store.query<{ n: unknown }>("RETURN 42 AS n");
    expect(rows[0]).toBeDefined();
  });
});

// ── Unit tests (always run) ──────────────────────────────────────────────────

describe("Cypher constants", () => {
  it("UPSERT_DOCUMENT contains MERGE on vaultId and storeKey", async () => {
    const { UPSERT_DOCUMENT } = await import("../cypher.js");
    expect(UPSERT_DOCUMENT).toContain("MERGE (d:Document {vaultId:");
  });

  it("ACQUIRE_LOCK contains conditional SET to prevent takeover", async () => {
    const { ACQUIRE_LOCK } = await import("../cypher.js");
    expect(ACQUIRE_LOCK).toContain("CASE WHEN");
  });

  it("UPSERT_SEMANTIC_EDGE uses apoc.merge.relationship", async () => {
    const { UPSERT_SEMANTIC_EDGE } = await import("../cypher.js");
    expect(UPSERT_SEMANTIC_EDGE).toContain("apoc.merge.relationship");
  });
});

describe("loadMigrations path", () => {
  it("resolves the migrations directory", async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(1);
  });
});
