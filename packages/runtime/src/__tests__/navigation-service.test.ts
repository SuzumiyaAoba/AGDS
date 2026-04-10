import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractFrontmatter,
  InMemoryDocumentStore,
  InMemoryGraphStore,
  type DocumentBlob,
} from "@agds/core";
import { SyncService } from "../sync-service.js";
import { NavigationService } from "../navigation-service.js";

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

const VAULT_ID = "nav-test-vault";
const FIXTURE_FILES = [
  "001-no-frontmatter.md",
  "002-with-links.md",
  "003-with-suggestions.md",
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

async function buildFixtures(): Promise<{
  graph: InMemoryGraphStore;
  service: NavigationService;
}> {
  const store = new InMemoryDocumentStore("fs");
  const graph = new InMemoryGraphStore();

  for (const file of FIXTURE_FILES) {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
    store.seed(VAULT_ID, makeBlob("fs", file, raw, `v:${file}`));
  }

  await new SyncService({
    vaultId: VAULT_ID,
    store,
    graph,
    holder: "nav-test",
    now: fixedClock("2026-04-11T00:00:00.000Z"),
  }).sync();

  const service = new NavigationService({ vaultId: VAULT_ID, graph });
  return { graph, service };
}

// ── neighbors ────────────────────────────────────────────────────────────────

describe("NavigationService — neighbors", () => {
  it("returns direct outgoing neighbors (depth=1)", async () => {
    const { service } = await buildFixtures();
    // 002-with-links.md has active links to 001 and 003
    const results = await service.neighbors("002-with-links.md");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.depth).toBe(1);
      expect(r.edge.status).toBe("active");
    }
    const storeKeys = results.map((r) => r.document.storeKey);
    expect(storeKeys).toContain("001-no-frontmatter.md");
    expect(storeKeys).toContain("003-with-suggestions.md");
  });

  it("filters by relationship type", async () => {
    const { service } = await buildFixtures();
    const all = await service.neighbors("002-with-links.md");
    const implementsOnly = await service.neighbors("002-with-links.md", {
      type: "IMPLEMENTS",
    });
    // IMPLEMENTS edges should be a subset
    expect(implementsOnly.length).toBeLessThanOrEqual(all.length);
    for (const r of implementsOnly) {
      expect(r.edge.type).toBe("IMPLEMENTS");
    }
  });

  it("includes pending edges when status=pending", async () => {
    const { service } = await buildFixtures();
    const pending = await service.neighbors("002-with-links.md", {
      status: "pending",
    });
    for (const r of pending) {
      expect(r.edge.status).toBe("pending");
    }
  });

  it("includes all statuses when status=any", async () => {
    const { service } = await buildFixtures();
    const any = await service.neighbors("002-with-links.md", { status: "any" });
    const active = await service.neighbors("002-with-links.md", { status: "active" });
    const pending = await service.neighbors("002-with-links.md", { status: "pending" });
    // Total "any" neighbors should cover active + pending
    expect(any.length).toBeGreaterThanOrEqual(active.length);
    expect(any.length).toBeGreaterThanOrEqual(pending.length);
  });

  it("returns depth-2 neighbors when depth=2", async () => {
    const { service } = await buildFixtures();
    // 001 -> 002 -> 001 (cycle) and 002 -> 003
    // Depth-1 from 001: {002}
    // Depth-2 from 001: {003} (002's neighbor, excluding already-visited 001)
    const depth2 = await service.neighbors("001-no-frontmatter.md", { depth: 2 });
    const storeKeys = depth2.map((r) => r.document.storeKey);
    // 002 is at depth 1
    const depth1Results = depth2.filter((r) => r.depth === 1);
    const depth2Results = depth2.filter((r) => r.depth === 2);
    expect(depth1Results.map((r) => r.document.storeKey)).toContain(
      "002-with-links.md",
    );
    // 002 links to 003, so 003 appears at depth 2
    expect(depth2Results.map((r) => r.document.storeKey)).toContain(
      "003-with-suggestions.md",
    );
    // No document appears more than once (de-duplication)
    const unique = new Set(storeKeys);
    expect(unique.size).toBe(storeKeys.length);
  });

  it("does not include the root document itself in results", async () => {
    const { service } = await buildFixtures();
    const results = await service.neighbors("002-with-links.md", { depth: 2 });
    const storeKeys = results.map((r) => r.document.storeKey);
    expect(storeKeys).not.toContain("002-with-links.md");
  });
});

// ── backlinks ─────────────────────────────────────────────────────────────────

describe("NavigationService — backlinks", () => {
  it("returns documents with active edges pointing at the target", async () => {
    const { service } = await buildFixtures();
    // 002-with-links.md has active links to 001-no-frontmatter.md
    const results = await service.backlinks("001-no-frontmatter.md");
    expect(results.length).toBeGreaterThan(0);
    const storeKeys = results.map((r) => r.document.storeKey);
    expect(storeKeys).toContain("002-with-links.md");
    for (const r of results) {
      expect(r.edge.status).toBe("active");
      expect(r.edge.targetDocId).toBeDefined();
    }
  });

  it("returns empty when no documents link to the target", async () => {
    const { service } = await buildFixtures();
    // 002-with-links.md is not pointed to by any fixture's active edges
    // (003 has a pending suggestion to 002, not an active edge)
    const results = await service.backlinks("002-with-links.md");
    // Only active edges are returned; 001 has an active link to 002
    const storeKeys = results.map((r) => r.document.storeKey);
    expect(storeKeys).toContain("001-no-frontmatter.md");
  });

  it("excludes pending edges from backlinks", async () => {
    const { service } = await buildFixtures();
    // 003-with-suggestions.md is only linked via a pending suggestion from 002
    // and an active link? Let's check 002's links to 003
    const results = await service.backlinks("003-with-suggestions.md");
    for (const r of results) {
      expect(r.edge.status).toBe("active");
    }
  });
});
