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
import { FetchService } from "../fetch-service.js";

const FIXTURES_DIR = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

const VAULT_ID = "fetch-test-vault";
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
  store: InMemoryDocumentStore;
  graph: InMemoryGraphStore;
  service: FetchService;
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
    holder: "fetch-test",
    now: fixedClock("2026-04-11T00:00:00.000Z"),
  }).sync();

  const service = new FetchService({ vaultId: VAULT_ID, graph, store });
  return { store, graph, service };
}

// ── Full-document fetch ──────────────────────────────────────────────────────

describe("FetchService — full document fetch", () => {
  it("returns the full document body in md format", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("001-no-frontmatter.md");
    expect(result.format).toBe("md");
    expect(result.document.storeKey).toBe("001-no-frontmatter.md");
    expect(result.body).toContain("# Simple Document");
    expect(result.body).toContain("## Section A");
    expect(result.heading).toBeUndefined();
  });

  it("does not include YAML frontmatter in the returned body", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("002-with-links.md");
    // The YAML block between `---` delimiters must be absent.
    expect(result.body).not.toMatch(/^---[\s\S]*?---/m);
    // Fields that only appear in frontmatter
    expect(result.body).not.toMatch(/^title:/m);
    expect(result.body).not.toMatch(/^author:/m);
  });
});

// ── Section slicing ──────────────────────────────────────────────────────────

describe("FetchService — section slicing", () => {
  it("returns only the requested section and its sub-sections", async () => {
    const { service } = await buildFixtures();
    // 001-no-frontmatter.md has h2 "Section A" (slug: "section-a")
    const result = await service.fetch("001-no-frontmatter.md", {
      section: "section-a",
    });
    expect(result.heading?.slug).toBe("section-a");
    expect(result.body).toContain("## Section A");
    // Must not include content from the next sibling section
    expect(result.body).not.toContain("## Section B");
  });

  it("slices only up to the next heading of equal or higher level", async () => {
    const { service } = await buildFixtures();
    // 002-with-links.md has h2 "Explicit Links" and h2 "Suggestions Section"
    const result = await service.fetch("002-with-links.md", {
      section: "explicit-links",
    });
    expect(result.heading?.slug).toBe("explicit-links");
    expect(result.body).toContain("## Explicit Links");
    expect(result.body).not.toContain("## Suggestions Section");
  });

  it("falls back to the full body when the section slug is not found", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("001-no-frontmatter.md", {
      section: "no-such-section",
    });
    expect(result.heading).toBeUndefined();
    // Full body returned
    expect(result.body).toContain("# Simple Document");
    expect(result.body).toContain("## Section A");
    expect(result.body).toContain("## Section B");
  });
});

// ── Format conversion ────────────────────────────────────────────────────────

describe("FetchService — format conversion", () => {
  it("md format returns raw markdown", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("001-no-frontmatter.md", { format: "md" });
    expect(result.format).toBe("md");
    expect(result.body).toContain("## Section A");
  });

  it("text format strips heading markers", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("001-no-frontmatter.md", {
      section: "section-a",
      format: "text",
    });
    expect(result.format).toBe("text");
    // Heading markers removed
    expect(result.body).not.toMatch(/^#{1,6}\s/m);
    // Content preserved
    expect(result.body).toContain("Section A");
  });

  it("json format returns a parsable JSON string with a body key", async () => {
    const { service } = await buildFixtures();
    const result = await service.fetch("001-no-frontmatter.md", { format: "json" });
    expect(result.format).toBe("json");
    const parsed = JSON.parse(result.body) as { body: string };
    expect(typeof parsed.body).toBe("string");
    expect(parsed.body).toContain("Simple Document");
  });
});
