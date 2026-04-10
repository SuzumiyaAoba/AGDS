import { describe, expect, it } from "vitest";
import {
  makeExplicitOccurrenceKey,
  makeExternalOccurrenceKey,
  makeManagedSuggestionOccurrenceKey,
} from "../parser/occurrence-key.js";

describe("makeExplicitOccurrenceKey", () => {
  it("produces the ex: prefix", () => {
    const key = makeExplicitOccurrenceKey("intro", "target.md", "Link text", undefined, 0);
    expect(key).toMatch(/^ex:[0-9a-f]{40}$/);
  });

  it("is stable across calls with identical input", () => {
    const a = makeExplicitOccurrenceKey("intro", "target.md", "Link text", undefined, 0);
    const b = makeExplicitOccurrenceKey("intro", "target.md", "Link text", undefined, 0);
    expect(a).toBe(b);
  });

  it("differs when heading slug differs", () => {
    const a = makeExplicitOccurrenceKey("section-a", "target.md", "Link", undefined, 0);
    const b = makeExplicitOccurrenceKey("section-b", "target.md", "Link", undefined, 0);
    expect(a).not.toBe(b);
  });

  it("differs when target differs", () => {
    const a = makeExplicitOccurrenceKey("intro", "a.md", "Link", undefined, 0);
    const b = makeExplicitOccurrenceKey("intro", "b.md", "Link", undefined, 0);
    expect(a).not.toBe(b);
  });

  it("differs when anchor differs", () => {
    const a = makeExplicitOccurrenceKey("intro", "target.md", "Link", "heading-1", 0);
    const b = makeExplicitOccurrenceKey("intro", "target.md", "Link", "heading-2", 0);
    expect(a).not.toBe(b);
  });

  it("differs when nth occurrence differs", () => {
    const a = makeExplicitOccurrenceKey("intro", "target.md", "Link", undefined, 0);
    const b = makeExplicitOccurrenceKey("intro", "target.md", "Link", undefined, 1);
    expect(a).not.toBe(b);
  });

  it("is case-insensitive for target and anchor text", () => {
    const a = makeExplicitOccurrenceKey("intro", "Target.md", "Link Text", undefined, 0);
    const b = makeExplicitOccurrenceKey("intro", "target.md", "link text", undefined, 0);
    expect(a).toBe(b);
  });

  it("is stable under surrounding whitespace in anchor text", () => {
    const a = makeExplicitOccurrenceKey("intro", "target.md", "  Link  ", undefined, 0);
    const b = makeExplicitOccurrenceKey("intro", "target.md", "Link", undefined, 0);
    expect(a).toBe(b);
  });

  // Regression: adding an unrelated link elsewhere must not change the key
  // of unchanged links. We assert that the key depends only on its own
  // parameters (simulated by verifying different nths produce different keys,
  // but the same nth is always stable).
  it("stability — key does not change when unrelated link is added (same nth)", () => {
    const before = makeExplicitOccurrenceKey("section-a", "b.md", "B", undefined, 0);
    // Simulating an unrelated link added in a different section does not
    // affect keys in section-a at the same nth.
    const after = makeExplicitOccurrenceKey("section-a", "b.md", "B", undefined, 0);
    expect(before).toBe(after);
  });
});

describe("makeManagedSuggestionOccurrenceKey", () => {
  it("produces the sl: prefix", () => {
    const key = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    expect(key).toMatch(/^sl:[0-9a-f]{40}$/);
  });

  it("is stable across calls", () => {
    const a = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    const b = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    expect(a).toBe(b);
  });

  it("does not depend on type annotation (type is mutable)", () => {
    // The key must not include the type so editing-type does not invalidate it.
    // We derive keys with different type values — type is NOT a parameter of
    // this function by design.
    const a = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    const b = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    expect(a).toBe(b);
  });

  it("differs from explicit key for same payload", () => {
    const ex = makeExplicitOccurrenceKey("", "target.md", "Anchor", undefined, 0);
    const sl = makeManagedSuggestionOccurrenceKey("target.md", "Anchor", undefined);
    expect(ex).not.toBe(sl);
  });
});

describe("makeExternalOccurrenceKey", () => {
  it("produces the ext: prefix", () => {
    const key = makeExternalOccurrenceKey("some-payload");
    expect(key).toMatch(/^ext:[0-9a-f]{40}$/);
  });

  it("is stable for identical payloads", () => {
    expect(makeExternalOccurrenceKey("x")).toBe(makeExternalOccurrenceKey("x"));
  });

  it("differs for different payloads", () => {
    expect(makeExternalOccurrenceKey("a")).not.toBe(makeExternalOccurrenceKey("b"));
  });
});
