import { describe, expect, it } from "vitest";
import {
  createDocumentId,
  toOccurrenceKey,
  toPublicId,
} from "../types/identity.js";

describe("createDocumentId", () => {
  it("produces a 16-character hex string", () => {
    const id = createDocumentId("vault-1", "docs/foo.md");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = createDocumentId("vault-1", "docs/foo.md");
    const b = createDocumentId("vault-1", "docs/foo.md");
    expect(a).toBe(b);
  });

  it("differs when vaultId differs", () => {
    const a = createDocumentId("vault-1", "docs/foo.md");
    const b = createDocumentId("vault-2", "docs/foo.md");
    expect(a).not.toBe(b);
  });

  it("differs when storeKey differs", () => {
    const a = createDocumentId("vault-1", "docs/foo.md");
    const b = createDocumentId("vault-1", "docs/bar.md");
    expect(a).not.toBe(b);
  });
});

describe("toPublicId", () => {
  it("returns the raw string unchanged", () => {
    expect(toPublicId("my-doc")).toBe("my-doc");
  });
});

describe("toOccurrenceKey", () => {
  it("returns the raw string unchanged", () => {
    expect(toOccurrenceKey("occ-1")).toBe("occ-1");
  });
});
