import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createDocumentId,
  extractFrontmatter,
  InMemoryDocumentStore,
  InMemoryGraphStore,
  AgdsError,
  type DocumentBlob,
} from "@agds/core";
import { SyncService } from "../sync-service.js";
import { ResolveService } from "../resolve-service.js";

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

const VAULT_ID = "resolve-test-vault";
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

async function buildFixtureGraph(): Promise<{
  graph: InMemoryGraphStore;
  service: ResolveService;
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
    holder: "resolve-test",
    now: fixedClock("2026-04-11T00:00:00.000Z"),
  }).sync();

  const service = new ResolveService({ vaultId: VAULT_ID, graph });
  return { graph, service };
}

// ── Normalization ladder tests ──────────────────────────────────────────────

describe("ResolveService — normalization ladder", () => {
  it("resolves by publicId (002-with-links has agds.id = doc-with-links)", async () => {
    const { service } = await buildFixtureGraph();
    const result = await service.resolve("doc-with-links");
    expect(result.matchedBy).toBe("publicId");
    expect(result.fuzzy).toBe(false);
    expect(result.document.publicId).toBe("doc-with-links");
    expect(result.document.storeKey).toBe("002-with-links.md");
  });

  it("resolves by Document.id (16-char hex)", async () => {
    const { service, graph } = await buildFixtureGraph();
    const doc = await graph.findDocumentByRef(VAULT_ID, "fs", "001-no-frontmatter.md");
    expect(doc).not.toBeNull();
    const result = await service.resolve(doc!.id);
    expect(result.matchedBy).toBe("document.id");
    expect(result.fuzzy).toBe(false);
    expect(result.document.id).toBe(doc!.id);
  });

  it("resolves by storeKey", async () => {
    const { service } = await buildFixtureGraph();
    const result = await service.resolve("003-with-suggestions.md");
    expect(result.matchedBy).toBe("storeKey");
    expect(result.fuzzy).toBe(false);
    expect(result.document.storeKey).toBe("003-with-suggestions.md");
  });

  it("resolves by path (same as storeKey in FS adapter)", async () => {
    // For the InMemoryDocumentStore the path and storeKey are set to the same value
    // in the fixture setup (makeBlob uses `path: storeKey`).  A document whose
    // storeKey was changed but path preserved would hit the path branch; here we
    // verify the path branch directly by seeding a custom entry.
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    const raw = readFileSync(join(FIXTURES_DIR, "001-no-frontmatter.md"), "utf8");
    const blob: DocumentBlob = {
      ref: { storeId: "fs", storeKey: "internal-key-001", path: "docs/no-frontmatter.md" },
      body: raw,
      stat: {
        hash: createHash("sha256").update(raw, "utf8").digest("hex"),
        bytes: Buffer.byteLength(raw, "utf8"),
        storeVersion: "v1",
      },
    };
    store.seed(VAULT_ID, blob);

    await new SyncService({
      vaultId: VAULT_ID,
      store,
      graph,
      holder: "resolve-test",
      now: fixedClock("2026-04-11T00:00:00.000Z"),
    }).sync();

    const service = new ResolveService({ vaultId: VAULT_ID, graph });

    // storeKey "internal-key-001" should match by storeKey
    const byStoreKey = await service.resolve("internal-key-001");
    expect(byStoreKey.matchedBy).toBe("storeKey");

    // path "docs/no-frontmatter.md" should match by path
    const byPath = await service.resolve("docs/no-frontmatter.md");
    expect(byPath.matchedBy).toBe("path");
    expect(byPath.document.path).toBe("docs/no-frontmatter.md");
  });

  it("resolves by exact title", async () => {
    const { service } = await buildFixtureGraph();
    // 002-with-links.md has title "Document With Links"
    const result = await service.resolve("Document With Links");
    expect(result.matchedBy).toBe("title");
    expect(result.fuzzy).toBe(false);
    expect(result.document.storeKey).toBe("002-with-links.md");
  });

  it("resolves by fuzzy title (edit-distance)", async () => {
    const { service } = await buildFixtureGraph();
    // "Docment With Links" is one character off from "Document With Links"
    // but the threshold for a string of length 18 is max(1, floor(18/4)) = 4
    // so edit distance 1 is within threshold.
    const result = await service.resolve("Docment With Links");
    expect(result.matchedBy).toBe("fuzzy");
    expect(result.fuzzy).toBe(true);
    expect(result.document.storeKey).toBe("002-with-links.md");
  });

  it("strips AGDS explicit link syntax before resolving", async () => {
    const { service } = await buildFixtureGraph();
    const result = await service.resolve("[[See also](002-with-links.md)]");
    expect(result.matchedBy).toBe("storeKey");
    expect(result.document.storeKey).toBe("002-with-links.md");
  });

  it("strips AGDS suggestion link syntax before resolving", async () => {
    const { service } = await buildFixtureGraph();
    const result = await service.resolve("[?[Maybe related](003-with-suggestions.md)]");
    expect(result.matchedBy).toBe("storeKey");
    expect(result.document.storeKey).toBe("003-with-suggestions.md");
  });
});

// ── Heading anchor resolution ───────────────────────────────────────────────

describe("ResolveService — heading anchor resolution", () => {
  it("resolves a document#heading-slug and returns the heading", async () => {
    const { service, graph } = await buildFixtureGraph();
    // 002-with-links.md has a heading "Explicit Links" → slug "explicit-links"
    const doc = await graph.findDocumentByRef(VAULT_ID, "fs", "002-with-links.md");
    expect(doc).not.toBeNull();
    const headings = await graph.listHeadingsForDocument(doc!.id);
    const slugs = headings.map((h) => h.slug);
    // Pick any heading slug that was parsed
    const slug = slugs[0];
    expect(slug).toBeDefined();

    const result = await service.resolve(`002-with-links.md#${slug}`);
    expect(result.matchedBy).toBe("storeKey");
    expect(result.heading).toBeDefined();
    expect(result.heading?.slug).toBe(slug);
  });

  it("returns undefined heading when anchor slug is not found", async () => {
    const { service } = await buildFixtureGraph();
    const result = await service.resolve("002-with-links.md#non-existent-slug");
    expect(result.document.storeKey).toBe("002-with-links.md");
    expect(result.heading).toBeUndefined();
  });
});

// ── Edge summary ───────────────────────────────────────────────────────────

describe("ResolveService — edge summary", () => {
  it("returns outgoing edge counts for a document with links", async () => {
    const { service } = await buildFixtureGraph();
    // 002-with-links.md has explicit links to other fixture documents
    const result = await service.resolve("002-with-links.md");
    expect(result.edges.total).toBeGreaterThan(0);
    expect(result.edges.active + result.edges.pending).toBeLessThanOrEqual(
      result.edges.total,
    );
  });

  it("returns zero edge counts for a document seeded with no outgoing links", async () => {
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();
    // A document body with no AGDS link syntax
    const raw = "# Isolated Doc\n\nNo links here.\n";
    store.seed(VAULT_ID, makeBlob("fs", "isolated.md", raw, "v1"));

    await new SyncService({
      vaultId: VAULT_ID,
      store,
      graph,
      holder: "resolve-test",
      now: fixedClock("2026-04-11T00:00:00.000Z"),
    }).sync();

    const service = new ResolveService({ vaultId: VAULT_ID, graph });
    const result = await service.resolve("isolated.md");
    expect(result.edges.total).toBe(0);
    expect(result.edges.active).toBe(0);
    expect(result.edges.pending).toBe(0);
  });
});

// ── Read-only invariant ────────────────────────────────────────────────────

describe("ResolveService — read-only invariant", () => {
  it("does not mutate the graph on a miss", async () => {
    const { service, graph } = await buildFixtureGraph();

    const before = await graph.listDocuments(VAULT_ID);

    await expect(service.resolve("999-definitely-missing.md")).rejects.toThrow(
      AgdsError,
    );

    const after = await graph.listDocuments(VAULT_ID);
    expect(after).toEqual(before);
  });

  it("throws RESOLVE_NOT_FOUND on a miss with the normalization trail", async () => {
    const { service } = await buildFixtureGraph();

    try {
      await service.resolve("absolutely-nothing-here.md");
      expect.fail("Expected AgdsError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AgdsError);
      const agdsErr = err as AgdsError;
      expect(agdsErr.code).toBe("RESOLVE_NOT_FOUND");
      expect(Array.isArray(agdsErr.details?.["trail"])).toBe(true);
      const trail = agdsErr.details?.["trail"] as string[];
      expect(trail).toContain("publicId");
      expect(trail).toContain("document.id");
      expect(trail).toContain("storeKey");
      expect(trail).toContain("path");
      expect(trail).toContain("title");
      expect(trail).toContain("fuzzy");
    }
  });

  it("does not mutate the graph on repeated misses", async () => {
    const { service, graph } = await buildFixtureGraph();

    for (let i = 0; i < 3; i++) {
      await expect(service.resolve("missing.md")).rejects.toThrow(AgdsError);
    }

    // Graph state unchanged
    const docs = await graph.listDocuments(VAULT_ID);
    expect(docs).toHaveLength(FIXTURE_FILES.length);
  });
});

// ── publicId resolution priority ──────────────────────────────────────────

describe("ResolveService — publicId resolves before document.id", () => {
  it("publicId lookup takes priority over document.id lookup", async () => {
    const { service } = await buildFixtureGraph();
    // 002-with-links.md carries publicId "doc-with-links".
    // Ensure the publicId step fires first, not a later step.
    const result = await service.resolve("doc-with-links");
    expect(result.matchedBy).toBe("publicId");
  });
});
