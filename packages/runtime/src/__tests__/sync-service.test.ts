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

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

describe("SyncService", () => {
  it("syncs the fixture vault into a stable graph state", async () => {
    const vaultId = "fixture-vault";
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    for (const file of [
      "001-no-frontmatter.md",
      "002-with-links.md",
      "003-with-suggestions.md",
      "004-with-broken-link.md",
    ]) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
      store.seed(vaultId, makeBlob("fs", file, raw, `v:${file}`));
    }

    const service = new SyncService({
      vaultId,
      store,
      graph,
      holder: "sync-test",
      now: fixedClock("2026-04-10T00:00:00.000Z"),
    });

    const first = await service.sync();
    expect(first).toEqual({
      scanned: 4,
      created: 4,
      updated: 0,
      unchanged: 0,
      archived: 0,
      edgesUpserted: 10,
      edgesDeleted: 0,
      brokenLinksUpserted: 1,
      brokenLinksDeleted: 0,
    });

    const docs = await graph.listDocuments(vaultId);
    expect(docs).toHaveLength(4);

    const withLinks = docs.find((doc) => doc.storeKey === "002-with-links.md");
    expect(withLinks?.title).toBe("Document With Links");
    expect(withLinks?.publicId).toBe("doc-with-links");
    expect(graph.getTags(withLinks!.id).map((tag) => tag.name)).toEqual([
      "architecture",
      "core",
    ]);
    expect((await graph.listEdgesFrom(withLinks!.id))).toHaveLength(8);

    const firstSnapshot = await snapshotGraph(graph, vaultId);
    const second = await service.sync();
    const secondSnapshot = await snapshotGraph(graph, vaultId);

    expect(second).toEqual({
      scanned: 4,
      created: 0,
      updated: 0,
      unchanged: 4,
      archived: 0,
      edgesUpserted: 0,
      edgesDeleted: 0,
      brokenLinksUpserted: 0,
      brokenLinksDeleted: 0,
    });
    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  it("creates broken links and heals them when the target appears later", async () => {
    const vaultId = "broken-link-vault";
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    store.seed(
      vaultId,
      makeBlob(
        "fs",
        "source.md",
        "# Source\n\nMissing: [[Target](missing.md)]\n",
        "v1",
      ),
    );

    const service = new SyncService({
      vaultId,
      store,
      graph,
      holder: "sync-test",
      now: fixedClock("2026-04-10T01:00:00.000Z"),
    });

    await service.sync();

    const source = await graph.findDocumentByRef(vaultId, "fs", "source.md");
    expect(source).not.toBeNull();
    expect(await graph.listEdgesFrom(source!.id)).toEqual([]);
    expect(graph.getBrokenLinks(source!.id).map((link) => link.rawTarget)).toEqual(
      ["missing.md"],
    );

    store.seed(
      vaultId,
      makeBlob("fs", "missing.md", "# Target\n\nNow present.\n", "v1"),
    );

    const second = await service.sync();
    expect(second).toMatchObject({
      created: 1,
      unchanged: 1,
      edgesUpserted: 1,
      brokenLinksDeleted: 1,
    });

    expect(graph.getBrokenLinks(source!.id)).toEqual([]);
    const healedEdges = await graph.listEdgesFrom(source!.id);
    expect(healedEdges).toHaveLength(1);
    expect(healedEdges[0]?.type).toBe("LINKS_TO");
  });

  it("archives documents that disappear from the store", async () => {
    const vaultId = "archive-vault";
    const graph = new InMemoryGraphStore();
    const storeV1 = new InMemoryDocumentStore("fs");
    const storeV2 = new InMemoryDocumentStore("fs");

    storeV1.seed(vaultId, makeBlob("fs", "a.md", "# A\n", "v1"));
    storeV1.seed(vaultId, makeBlob("fs", "b.md", "# B\n", "v1"));
    storeV2.seed(vaultId, makeBlob("fs", "a.md", "# A\n", "v1"));

    await new SyncService({
      vaultId,
      store: storeV1,
      graph,
      holder: "sync-test",
      now: fixedClock("2026-04-10T02:00:00.000Z"),
    }).sync();

    const second = await new SyncService({
      vaultId,
      store: storeV2,
      graph,
      holder: "sync-test",
      now: fixedClock("2026-04-10T03:00:00.000Z"),
    }).sync();

    expect(second.archived).toBe(1);
    expect((await graph.listDocuments(vaultId)).map((doc) => doc.storeKey)).toEqual([
      "a.md",
    ]);
    expect(
      (await graph.findDocumentByRef(vaultId, "fs", "b.md"))?.archived,
    ).toBe(true);
  });

  it("fails when the shared write lock is already held", async () => {
    const vaultId = "lock-vault";
    const store = new InMemoryDocumentStore("fs");
    const graph = new InMemoryGraphStore();

    store.seed(vaultId, makeBlob("fs", "a.md", "# A\n", "v1"));
    await graph.acquireLock("write", "other-holder", 60_000);

    const service = new SyncService({
      vaultId,
      store,
      graph,
      holder: "sync-test",
      now: fixedClock("2026-04-10T04:00:00.000Z"),
    });

    await expect(service.sync()).rejects.toMatchObject({ code: "LOCK_CONFLICT" });
  });
});

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

async function snapshotGraph(graph: InMemoryGraphStore, vaultId: string) {
  const docs = [...(await graph.listDocuments(vaultId))].sort((a, b) =>
    a.storeKey.localeCompare(b.storeKey),
  );

  return Promise.all(
    docs.map(async (doc) => ({
      id: doc.id,
      publicId: doc.publicId ?? null,
      storeKey: doc.storeKey,
      title: doc.title,
      hash: doc.hash,
      headings: graph
        .getHeadings(doc.id)
        .map((heading) => `${heading.level}:${heading.slug}`),
      tags: graph.getTags(doc.id).map((tag) => tag.name),
      edges: (await graph.listEdgesFrom(doc.id))
        .map((edge) => ({
          occurrenceKey: edge.occurrenceKey,
          targetDocId: edge.targetDocId,
          type: edge.type,
          source: edge.source,
          status: edge.status,
          anchor: edge.anchor ?? null,
          createdAt: edge.createdAt.toISOString(),
          updatedAt: edge.updatedAt.toISOString(),
        }))
        .sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey)),
      brokenLinks: graph
        .getBrokenLinks(doc.id)
        .map((link) => ({
          occurrenceKey: link.occurrenceKey,
          rawTarget: link.rawTarget,
          anchor: link.anchor ?? null,
          reason: link.reason,
          createdAt: link.createdAt.toISOString(),
          updatedAt: link.updatedAt.toISOString(),
        }))
        .sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey)),
    })),
  );
}
