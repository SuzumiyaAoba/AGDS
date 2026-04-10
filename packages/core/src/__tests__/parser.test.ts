import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocumentId } from "../types/identity.js";
import { parseDocument } from "../parser/index.js";

const FIXTURES = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function docId(seed: string) {
  return createDocumentId("test-vault", seed);
}

// ── Frontmatter ──────────────────────────────────────────────────────────────

describe("frontmatter", () => {
  it("handles documents without frontmatter", () => {
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: docId("001") });
    expect(doc.agds).toEqual({});
    expect(doc.passthrough).toEqual({});
    // Body starts with the first heading.
    expect(doc.body.trimStart()).toMatch(/^# Simple Document/);
  });

  it("parses agds namespace fields", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    expect(doc.agds.id).toBe("doc-with-links");
    expect(doc.agds.tags).toEqual(["architecture", "core"]);
  });

  it("separates passthrough fields from agds namespace", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    expect(doc.passthrough).toHaveProperty("title", "Document With Links");
    expect(doc.passthrough).toHaveProperty("author", "test");
    expect(doc.passthrough).not.toHaveProperty("agds");
  });

  it("parses frozen and doNotSuggest booleans", () => {
    const raw = fixture("003-with-suggestions.md");
    const doc = parseDocument(raw, { docId: docId("003") });
    expect(doc.agds.frozen).toBe(false);
    expect(doc.agds.doNotSuggest).toBe(false);
  });
});

// ── Headings ─────────────────────────────────────────────────────────────────

describe("headings", () => {
  it("extracts all headings in order", () => {
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: docId("001") });
    expect(doc.headings.map((h) => h.text)).toEqual([
      "Simple Document",
      "Section A",
      "Section B",
    ]);
  });

  it("assigns correct levels", () => {
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: docId("001") });
    expect(doc.headings.map((h) => h.level)).toEqual([1, 2, 2]);
  });

  it("generates stable slugs", () => {
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: docId("001") });
    expect(doc.headings.map((h) => h.slug)).toEqual([
      "simple-document",
      "section-a",
      "section-b",
    ]);
  });

  it("assigns docId to all headings", () => {
    const id = docId("001");
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: id });
    expect(doc.headings.every((h) => h.docId === id)).toBe(true);
  });

  it("assigns monotonically increasing order values", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const orders = doc.headings.map((h) => h.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

// ── Link extraction ───────────────────────────────────────────────────────────

describe("link extraction", () => {
  it("extracts explicit links", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const explicit = doc.links.filter((l) => l.kind === "explicit");
    expect(explicit.length).toBeGreaterThanOrEqual(4);
  });

  it("extracts suggestion links", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const suggestions = doc.links.filter((l) => l.kind === "suggestion");
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it("assigns default types correctly", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });

    const plainExplicit = doc.links.find(
      (l) => l.kind === "explicit" && l.anchorText === "See also",
    );
    expect(plainExplicit?.type).toBe("LINKS_TO");

    const typedExplicit = doc.links.find(
      (l) => l.kind === "explicit" && l.anchorText === "Implements",
    );
    expect(typedExplicit?.type).toBe("IMPLEMENTS");
  });

  it("parses heading anchors in targets", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const anchorLink = doc.links.find((l) => l.rawTarget.includes("#"));
    expect(anchorLink).toBeDefined();
    expect(anchorLink?.anchor).toBe("section-a");
    expect(anchorLink?.rawTarget).toBe("001-no-frontmatter.md#section-a");
  });

  it("detects managed-section links", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const managed = doc.links.filter((l) => l.inManagedSection);
    expect(managed.length).toBeGreaterThanOrEqual(2);
    expect(managed.every((l) => l.kind === "suggestion")).toBe(true);
  });

  it("uses sl: prefix for managed-section suggestions", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const managed = doc.links.filter((l) => l.inManagedSection);
    expect(managed.every((l) => l.occurrenceKey.startsWith("sl:"))).toBe(true);
  });

  it("uses ex: prefix for non-managed links", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    const nonManaged = doc.links.filter((l) => !l.inManagedSection);
    expect(nonManaged.every((l) => l.occurrenceKey.startsWith("ex:"))).toBe(true);
  });

  it("assigns containingHeadingSlug correctly", () => {
    const raw = fixture("001-no-frontmatter.md");
    const doc = parseDocument(raw, { docId: docId("001") });
    const link = doc.links[0];
    expect(link?.containingHeadingSlug).toBe("section-a");
  });
});

// ── Golden snapshot ──────────────────────────────────────────────────────────

describe("golden snapshot", () => {
  it("002-with-links.md produces a stable link list", () => {
    const raw = fixture("002-with-links.md");
    const doc = parseDocument(raw, { docId: docId("002") });
    // Snapshot the link occurrenceKeys — changing these indicates a stability regression.
    const keys = doc.links.map((l) => l.occurrenceKey);
    expect(keys).toMatchSnapshot();
  });

  it("003-with-suggestions.md produces a stable link list", () => {
    const raw = fixture("003-with-suggestions.md");
    const doc = parseDocument(raw, { docId: docId("003") });
    const keys = doc.links.map((l) => l.occurrenceKey);
    expect(keys).toMatchSnapshot();
  });
});
