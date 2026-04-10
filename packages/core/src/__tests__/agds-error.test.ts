import { describe, expect, it } from "vitest";
import { AgdsError } from "../errors/agds-error.js";

describe("AgdsError", () => {
  it("is an instance of Error", () => {
    const err = new AgdsError("LOCK_CONFLICT", "conflict");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgdsError);
  });

  it("preserves code and message", () => {
    const err = new AgdsError("RESOLVE_NOT_FOUND", "not found");
    expect(err.code).toBe("RESOLVE_NOT_FOUND");
    expect(err.message).toBe("not found");
    expect(err.name).toBe("AgdsError");
  });

  it("preserves details payload", () => {
    const err = new AgdsError("GRAPH_BROKEN_LINK", "broken", { anchor: "#sec" });
    expect(err.details).toEqual({ anchor: "#sec" });
  });

  it("details is undefined when omitted", () => {
    const err = new AgdsError("LLM_RATE_LIMITED", "rate limited");
    expect(err.details).toBeUndefined();
  });

  describe("factory helpers", () => {
    it("publicIdConflict sets correct code and details", () => {
      const err = AgdsError.publicIdConflict("doc-abc", "my-id");
      expect(err.code).toBe("DOCUMENT_PUBLIC_ID_CONFLICT");
      expect(err.details).toMatchObject({ existingDocId: "doc-abc", publicId: "my-id" });
    });

    it("brokenLink sets correct code and details", () => {
      const err = AgdsError.brokenLink("#heading", "target not found");
      expect(err.code).toBe("GRAPH_BROKEN_LINK");
      expect(err.details).toMatchObject({ anchor: "#heading" });
    });

    it("llmRateLimited sets correct code", () => {
      const err = AgdsError.llmRateLimited("claude-3");
      expect(err.code).toBe("LLM_RATE_LIMITED");
    });

    it("resolveNotFound includes trail", () => {
      const err = AgdsError.resolveNotFound("foo.md", ["bar.md"]);
      expect(err.code).toBe("RESOLVE_NOT_FOUND");
      expect(err.details).toMatchObject({ trail: ["bar.md"] });
    });

    it("lockConflict sets correct code", () => {
      const err = AgdsError.lockConflict("sync", "worker-1");
      expect(err.code).toBe("LOCK_CONFLICT");
    });

    it("managedSectionConflict sets correct code", () => {
      const err = AgdsError.managedSectionConflict("doc-1", "<!-- agds -->");
      expect(err.code).toBe("MANAGED_SECTION_CONFLICT");
    });
  });
});
