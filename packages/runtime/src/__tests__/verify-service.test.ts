import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDocumentId,
  extractFrontmatter,
  InMemoryDocumentStore,
  InMemoryGraphStore,
  type DocumentBlob,
} from "@agds/core";
import { SyncService } from "../sync-service.js";
import { VerifyService } from "../verify-service.js";

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

describe("VerifyService", () => {
  it("reports fixture-vault broken links deterministically", async () => {
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

    await new SyncService({
      vaultId,
      store,
      graph,
      holder: "verify-test",
      now: fixedClock("2026-04-10T05:00:00.000Z"),
    }).sync();

    const brokenDoc = await graph.findDocumentByRef(
      vaultId,
      "fs",
      "004-with-broken-link.md",
    );
    expect(brokenDoc).not.toBeNull();

    const brokenLink = graph.getBrokenLinks(brokenDoc!.id)[0];
    expect(brokenLink).toBeDefined();

    const service = new VerifyService({ vaultId, graph });
    const first = await service.verify();
    const second = await service.verify();

    expect(second).toEqual(first);
    expect(first.issues).toEqual([
      {
        kind: "broken_link",
        message:
          'Document "004-with-broken-link.md" has a broken link to "999-missing.md".',
        docId: brokenDoc!.id,
        context: {
          occurrenceKey: brokenLink!.occurrenceKey,
          rawTarget: "999-missing.md",
          reason: "UNRESOLVED_TARGET",
          storeKey: "004-with-broken-link.md",
          path: "004-with-broken-link.md",
        },
      },
    ]);
  });

  it("reports orphaned headings and tags in the core graph slice", async () => {
    const vaultId = "verify-orphans";
    const graph = new InMemoryGraphStore();
    const orphanDocId = createDocumentId(vaultId, "missing-doc.md");

    await graph.upsertHeadings(orphanDocId, [
      {
        id: `${orphanDocId}:ghost-heading`,
        docId: orphanDocId,
        level: 2,
        text: "Ghost Heading",
        slug: "ghost-heading",
        order: 0,
      },
    ]);
    await graph.upsertTags(orphanDocId, [{ name: "orphan-tag" }]);

    const result = await new VerifyService({ vaultId, graph }).verify();

    expect(result.issues).toEqual([
      {
        kind: "orphaned_heading",
        message: 'Heading "ghost-heading" is not attached to any document node.',
        docId: orphanDocId,
        context: {
          headingId: `${orphanDocId}:ghost-heading`,
          level: 2,
          slug: "ghost-heading",
          text: "Ghost Heading",
          order: 0,
        },
      },
      {
        kind: "orphaned_tag",
        message: 'Tag "orphan-tag" is not attached to any document node.',
        context: {
          name: "orphan-tag",
        },
      },
    ]);
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
