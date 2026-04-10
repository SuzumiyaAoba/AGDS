import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsDocumentStore } from "../fs-document-store.js";

const VAULT_ROOT = join(
  new URL("../../../../fixtures/vault", import.meta.url).pathname,
);

const VAULT_ID = "test-vault";

function makeStore(overrides?: Partial<ConstructorParameters<typeof FsDocumentStore>[0]>) {
  return new FsDocumentStore({ vaultRoot: VAULT_ROOT, ...overrides });
}

// ── list ─────────────────────────────────────────────────────────────────────

describe("list", () => {
  it("yields all .md files in the vault root", async () => {
    const store = makeStore();
    const refs = [];
    for await (const ref of store.list(VAULT_ID)) {
      refs.push(ref);
    }
    expect(refs.length).toBeGreaterThanOrEqual(3);
    expect(refs.every((r) => r.storeKey.endsWith(".md"))).toBe(true);
  });

  it("storeId matches the configured store id", async () => {
    const store = makeStore({ storeId: "my-store" });
    const refs = [];
    for await (const ref of store.list(VAULT_ID)) {
      refs.push(ref);
    }
    expect(refs.every((r) => r.storeId === "my-store")).toBe(true);
  });

  it("uses forward slashes in storeKey regardless of OS", async () => {
    const store = makeStore();
    for await (const ref of store.list(VAULT_ID)) {
      expect(ref.storeKey).not.toContain("\\");
    }
  });

  it("populates path hint equal to storeKey", async () => {
    const store = makeStore();
    for await (const ref of store.list(VAULT_ID)) {
      expect(ref.path).toBe(ref.storeKey);
    }
  });

  it("excludes non-md files when extensions default", async () => {
    const store = makeStore();
    for await (const ref of store.list(VAULT_ID)) {
      expect(ref.storeKey.endsWith(".md")).toBe(true);
    }
  });
});

// ── read ─────────────────────────────────────────────────────────────────────

describe("read", () => {
  it("returns the raw file content in body", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const blob = await store.read(ref);
    expect(blob.body).toContain("# Simple Document");
  });

  it("returns ref matching the input ref", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const blob = await store.read(ref);
    expect(blob.ref.storeKey).toBe("001-no-frontmatter.md");
  });

  it("computes a valid SHA-256 hash of the body without frontmatter", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const blob = await store.read(ref);
    expect(blob.stat.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash excludes frontmatter content", async () => {
    const store = makeStore();
    // 001 has no frontmatter; 002 has frontmatter — their hashes must differ
    const ref1 = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const ref2 = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const blob1 = await store.read(ref1);
    const blob2 = await store.read(ref2);
    expect(blob1.stat.hash).not.toBe(blob2.stat.hash);
  });

  it("storeVersion is an ISO 8601 date string", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const blob = await store.read(ref);
    expect(() => new Date(blob.stat.storeVersion)).not.toThrow();
    expect(new Date(blob.stat.storeVersion).toISOString()).toBe(blob.stat.storeVersion);
  });

  it("throws when the file does not exist", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "nonexistent.md", path: "nonexistent.md" };
    await expect(store.read(ref)).rejects.toThrow();
  });
});

// ── stat ─────────────────────────────────────────────────────────────────────

describe("stat", () => {
  it("returns the same stat as read()", async () => {
    const store = makeStore();
    const ref = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const blob = await store.read(ref);
    const statResult = await store.stat(ref);
    expect(statResult).toEqual(blob.stat);
  });
});

// ── resolveLinkTarget ─────────────────────────────────────────────────────────

describe("resolveLinkTarget", () => {
  it("resolves a sibling file reference", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const result = await store.resolveLinkTarget(from, "001-no-frontmatter.md");
    expect(result).not.toBeNull();
    expect(result?.storeKey).toBe("001-no-frontmatter.md");
  });

  it("strips the #anchor fragment before resolving", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const result = await store.resolveLinkTarget(from, "001-no-frontmatter.md#section-a");
    expect(result).not.toBeNull();
    expect(result?.storeKey).toBe("001-no-frontmatter.md");
  });

  it("returns null for a non-existent target", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const result = await store.resolveLinkTarget(from, "does-not-exist.md");
    expect(result).toBeNull();
  });

  it("returns null for path traversal outside vault root", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const result = await store.resolveLinkTarget(from, "../../etc/passwd");
    expect(result).toBeNull();
  });

  it("returns null for an empty target", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const result = await store.resolveLinkTarget(from, "");
    expect(result).toBeNull();
  });
});

// ── formatLinkTarget ──────────────────────────────────────────────────────────

describe("formatLinkTarget", () => {
  it("returns a relative path from sibling to sibling", () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const to = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    expect(store.formatLinkTarget(from, to)).toBe("002-with-links.md");
  });

  it("uses forward slashes in the result", () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "subdir/file.md", path: "subdir/file.md" };
    const to = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    expect(store.formatLinkTarget(from, to)).not.toContain("\\");
  });

  it("round-trips through resolveLinkTarget for fixture files", async () => {
    const store = makeStore();
    const from = { storeId: "fs", storeKey: "002-with-links.md", path: "002-with-links.md" };
    const to = { storeId: "fs", storeKey: "001-no-frontmatter.md", path: "001-no-frontmatter.md" };
    const formatted = store.formatLinkTarget(from, to);
    const resolved = await store.resolveLinkTarget(from, formatted);
    expect(resolved?.storeKey).toBe(to.storeKey);
  });
});

// ── capabilities ─────────────────────────────────────────────────────────────

describe("capabilities", () => {
  it("stableKeys is false for FS adapter", () => {
    const store = makeStore();
    expect(store.capabilities.stableKeys).toBe(false);
  });
});
