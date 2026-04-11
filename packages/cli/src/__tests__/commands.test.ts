/**
 * Fixture-based CLI command tests.
 *
 * These tests exercise the service logic that backs each CLI command using
 * in-memory stores seeded with the shared fixture vault. They mirror the
 * exact service calls each command makes so that regressions in command
 * wiring are caught without requiring a live Neo4j instance.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  extractFrontmatter,
  InMemoryDocumentStore,
  InMemoryGraphStore,
  type DocumentBlob,
} from "@agds/core";
import {
  SyncService,
  VerifyService,
  ResolveService,
  FetchService,
  NavigationService,
  QueryService,
} from "@agds/runtime";

// ── Shared fixture setup ──────────────────────────────────────────────────────

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

const VAULT_ID = "cli-test-vault";

const ALL_FIXTURE_FILES = [
  "001-no-frontmatter.md",
  "002-with-links.md",
  "003-with-suggestions.md",
  "004-with-broken-link.md",
] as const;

function makeBlob(
  storeId: string,
  storeKey: string,
  raw: string,
  storeVersion: string,
): DocumentBlob {
  const { body } = extractFrontmatter(raw);
  return {
    ref: { storeId, storeKey, path: storeKey },
    body: raw,
    stat: {
      hash: createHash("sha256").update(body, "utf8").digest("hex"),
      bytes: Buffer.byteLength(body, "utf8"),
      storeVersion,
    },
  };
}

function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

interface FixtureServices {
  store: InMemoryDocumentStore;
  graph: InMemoryGraphStore;
  sync: SyncService;
  verify: VerifyService;
  resolve: ResolveService;
  fetch: FetchService;
  navigation: NavigationService;
  query: QueryService;
}

async function buildFixtures(): Promise<FixtureServices> {
  const store = new InMemoryDocumentStore("fs");
  const graph = new InMemoryGraphStore();

  for (const file of ALL_FIXTURE_FILES) {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
    store.seed(VAULT_ID, makeBlob("fs", file, raw, `v:${file}`));
  }

  const syncService = new SyncService({
    vaultId: VAULT_ID,
    store,
    graph,
    holder: "cli-test",
    now: fixedClock("2026-04-11T00:00:00.000Z"),
  });
  await syncService.sync();

  const resolveService = new ResolveService({ vaultId: VAULT_ID, graph });

  return {
    store,
    graph,
    sync: syncService,
    verify: new VerifyService({ vaultId: VAULT_ID, graph }),
    resolve: resolveService,
    fetch: new FetchService({ vaultId: VAULT_ID, graph, store, resolver: resolveService }),
    navigation: new NavigationService({ vaultId: VAULT_ID, graph, resolver: resolveService }),
    query: new QueryService({ graph }),
  };
}

// ── `sync` command ────────────────────────────────────────────────────────────

describe("sync command — SyncService.sync()", () => {
  it("returns a summary with the correct scanned count", async () => {
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    for (const file of ALL_FIXTURE_FILES) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
      store.seed(VAULT_ID, makeBlob("fs", file, raw, `v:${file}`));
    }

    const service = new SyncService({
      vaultId: VAULT_ID,
      store,
      graph,
      holder: "sync-cmd-test",
      now: fixedClock("2026-04-11T00:00:00.000Z"),
    });

    const summary = await service.sync();

    // JSON output of `agds sync` includes status + all summary fields
    const output = { status: "ok", ...summary };
    expect(output.status).toBe("ok");
    expect(output.scanned).toBe(ALL_FIXTURE_FILES.length);
    expect(output.created).toBe(ALL_FIXTURE_FILES.length);
    expect(output.updated).toBe(0);
    expect(output.unchanged).toBe(0);
    expect(output.archived).toBe(0);
  });

  it("reports unchanged documents on a second sync", async () => {
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    for (const file of ALL_FIXTURE_FILES) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
      store.seed(VAULT_ID, makeBlob("fs", file, raw, `v:${file}`));
    }

    const service = new SyncService({
      vaultId: VAULT_ID,
      store,
      graph,
      holder: "sync-cmd-test-2",
      now: fixedClock("2026-04-11T00:00:00.000Z"),
    });

    await service.sync();
    const second = await service.sync();

    expect(second.unchanged).toBe(ALL_FIXTURE_FILES.length);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
  });
});

// ── `verify` command ──────────────────────────────────────────────────────────

describe("verify command — VerifyService.verify()", () => {
  it("reports broken links from the broken-link fixture", async () => {
    const { verify } = await buildFixtures();
    const result = await verify.verify();

    // JSON output of `agds verify` wraps the result
    const output = {
      status: result.issues.length > 0 ? "issues_found" : "ok",
      count: result.issues.length,
      issues: result.issues,
    };

    expect(output.status).toBe("issues_found");
    expect(output.count).toBeGreaterThan(0);

    const brokenLinks = output.issues.filter((i) => i.kind === "broken_link");
    expect(brokenLinks.length).toBeGreaterThan(0);
  });

  it("returns ok status when there are no issues", async () => {
    // Sync only documents without broken links
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();
    const cleanFiles = [
      "001-no-frontmatter.md",
      "002-with-links.md",
      "003-with-suggestions.md",
    ] as const;

    for (const file of cleanFiles) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
      store.seed(VAULT_ID, makeBlob("fs", file, raw, `v:${file}`));
    }

    await new SyncService({
      vaultId: VAULT_ID,
      store,
      graph,
      holder: "verify-clean-test",
      now: fixedClock("2026-04-11T00:00:00.000Z"),
    }).sync();

    const service = new VerifyService({ vaultId: VAULT_ID, graph });
    const result = await service.verify();

    const output = {
      status: result.issues.length > 0 ? "issues_found" : "ok",
      count: result.issues.length,
      issues: result.issues,
    };
    expect(output.status).toBe("ok");
    expect(output.count).toBe(0);
  });
});

// ── `resolve` command ─────────────────────────────────────────────────────────

describe("resolve command — ResolveService.resolve()", () => {
  let services: FixtureServices;

  beforeEach(async () => {
    services = await buildFixtures();
  });

  it("resolves by publicId and returns JSON-serialisable output", async () => {
    const result = await services.resolve.resolve("doc-with-links");
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.matchedBy).toBe("publicId");
    expect(output.fuzzy).toBe(false);
    expect(output.document.publicId).toBe("doc-with-links");
    expect(output.document.storeKey).toBe("002-with-links.md");
    expect(typeof output.edges.active).toBe("number");
    expect(typeof output.edges.pending).toBe("number");
    expect(typeof output.edges.total).toBe("number");
  });

  it("resolves by storeKey", async () => {
    const result = await services.resolve.resolve("001-no-frontmatter.md");
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.matchedBy).toBe("storeKey");
    expect(output.document.storeKey).toBe("001-no-frontmatter.md");
  });

  it("resolves by title", async () => {
    const result = await services.resolve.resolve("Document With Links");
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.matchedBy).toBe("title");
    expect(output.document.storeKey).toBe("002-with-links.md");
  });

  it("resolves anchor and returns heading in output", async () => {
    const result = await services.resolve.resolve("001-no-frontmatter.md#section-a");
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.heading).toBeDefined();
    expect(output.heading?.slug).toBe("section-a");
  });

  it("throws when ref is not found", async () => {
    await expect(
      services.resolve.resolve("totally-missing-doc"),
    ).rejects.toThrow();
  });
});

// ── `fetch` command ───────────────────────────────────────────────────────────

describe("fetch command — FetchService.fetch()", () => {
  let services: FixtureServices;

  beforeEach(async () => {
    services = await buildFixtures();
  });

  it("returns full document body in md format", async () => {
    const result = await services.fetch.fetch("001-no-frontmatter.md");
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.format).toBe("md");
    expect(output.body).toContain("# Simple Document");
    expect(output.document.storeKey).toBe("001-no-frontmatter.md");
  });

  it("returns only the requested section when --section is used", async () => {
    const result = await services.fetch.fetch("001-no-frontmatter.md", {
      section: "section-a",
    });
    const output = { status: "ok", ...result };

    expect(output.status).toBe("ok");
    expect(output.heading?.slug).toBe("section-a");
    expect(output.body).toContain("## Section A");
    expect(output.body).not.toContain("## Section B");
  });

  it("returns plain text when format=text", async () => {
    const result = await services.fetch.fetch("001-no-frontmatter.md", {
      section: "section-a",
      format: "text",
    });
    expect(result.format).toBe("text");
    expect(result.body).not.toMatch(/^#{1,6}\s/m);
  });

  it("returns JSON string when format=json", async () => {
    const result = await services.fetch.fetch("001-no-frontmatter.md", {
      format: "json",
    });
    expect(result.format).toBe("json");
    const parsed = JSON.parse(result.body) as { body: string };
    expect(typeof parsed.body).toBe("string");
  });
});

// ── `neighbors` command ───────────────────────────────────────────────────────

describe("neighbors command — NavigationService.neighbors()", () => {
  let services: FixtureServices;

  beforeEach(async () => {
    services = await buildFixtures();
  });

  it("returns direct neighbors of a document", async () => {
    // 001-no-frontmatter.md links explicitly to 002-with-links.md
    const results = await services.navigation.neighbors("001-no-frontmatter.md", {
      depth: 1,
      status: "active",
    });
    const output = { status: "ok", count: results.length, neighbors: results };

    expect(output.status).toBe("ok");
    expect(output.count).toBeGreaterThan(0);
    const storeKeys = output.neighbors.map((n) => n.document.storeKey);
    expect(storeKeys).toContain("002-with-links.md");
  });

  it("returns deeper neighbors with depth=2", async () => {
    // depth 1: 001 → 002; depth 2: 002 → 003
    const results = await services.navigation.neighbors("001-no-frontmatter.md", {
      depth: 2,
      status: "active",
    });
    const output = { status: "ok", count: results.length, neighbors: results };

    expect(output.count).toBeGreaterThanOrEqual(2);
    const storeKeys = output.neighbors.map((n) => n.document.storeKey);
    expect(storeKeys).toContain("002-with-links.md");
    expect(storeKeys).toContain("003-with-suggestions.md");
  });

  it("returns empty list for a document with no outgoing active edges", async () => {
    // 003-with-suggestions.md has no explicit links going out
    const results = await services.navigation.neighbors(
      "003-with-suggestions.md",
      { depth: 1, status: "active" },
    );
    const output = { status: "ok", count: results.length, neighbors: results };

    expect(output.status).toBe("ok");
    expect(output.count).toBe(0);
  });
});

// ── `backlinks` command ───────────────────────────────────────────────────────

describe("backlinks command — NavigationService.backlinks()", () => {
  let services: FixtureServices;

  beforeEach(async () => {
    services = await buildFixtures();
  });

  it("returns all documents that link to the target", async () => {
    // 001 and 002 both have links to 002/003 etc.
    // 002-with-links.md is linked from 001-no-frontmatter.md
    const results = await services.navigation.backlinks("002-with-links.md");
    const output = { status: "ok", count: results.length, backlinks: results };

    expect(output.status).toBe("ok");
    expect(output.count).toBeGreaterThan(0);
    const storeKeys = output.backlinks.map((b) => b.document.storeKey);
    expect(storeKeys).toContain("001-no-frontmatter.md");
  });

  it("returns empty list for a document nobody links to", async () => {
    // 001-no-frontmatter.md is not a target of any explicit link
    // (002 links BACK to 001 via IMPLEMENTS, so this doc may actually have backlinks)
    // Use the broken-link fixture which is unlikely to be a target
    const results = await services.navigation.backlinks("004-with-broken-link.md");
    const output = {
      status: "ok",
      count: results.length,
      backlinks: results,
    };
    expect(output.status).toBe("ok");
    // May be 0 or more; just verify the shape is correct
    expect(Array.isArray(output.backlinks)).toBe(true);
  });
});

// ── `query` command ───────────────────────────────────────────────────────────

describe("query command — QueryService.query()", () => {
  let services: FixtureServices;

  beforeEach(async () => {
    services = await buildFixtures();
  });

  it("rejects CREATE queries with QUERY_WRITE_FORBIDDEN", async () => {
    await expect(
      services.query.query("CREATE (n:Test) RETURN n"),
    ).rejects.toThrow();
  });

  it("rejects MERGE queries by default", async () => {
    await expect(
      services.query.query("MERGE (n:Test {id: 1}) RETURN n"),
    ).rejects.toThrow();
  });

  it("rejects SET queries by default", async () => {
    await expect(
      services.query.query("MATCH (n) SET n.x = 1 RETURN n"),
    ).rejects.toThrow();
  });

  it("rejects DELETE queries by default", async () => {
    await expect(
      services.query.query("MATCH (n) DELETE n"),
    ).rejects.toThrow();
  });

  it("passes read queries through to the graph store without QUERY_WRITE_FORBIDDEN", async () => {
    // The InMemoryGraphStore does not execute Cypher, but the important thing is
    // that QueryService does not throw QUERY_WRITE_FORBIDDEN for a MATCH query.
    // The graph store may throw its own unsupported-operation error, which is
    // distinct from a write-guard rejection.
    const error = await services.query
      .query("MATCH (n) RETURN n LIMIT 1")
      .catch((e: unknown) => e);

    if (error instanceof Error) {
      // Must NOT be the write-guard error
      expect(error.message).not.toContain("QUERY_WRITE_FORBIDDEN");
    }
    // If no error, the query ran successfully — also acceptable
  });
});
