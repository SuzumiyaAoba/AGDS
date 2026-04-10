import type { AgdsErrorCode } from "./error-codes.js";

export class AgdsError extends Error {
  readonly code: AgdsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AgdsErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgdsError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    // Restore prototype chain in compiled ES5 targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static publicIdConflict(
    existingDocId: string,
    publicId: string,
  ): AgdsError {
    return new AgdsError(
      "DOCUMENT_PUBLIC_ID_CONFLICT",
      `Public id "${publicId}" is already claimed by document "${existingDocId}".`,
      { existingDocId, publicId },
    );
  }

  static brokenLink(anchor: string, reason: string): AgdsError {
    return new AgdsError(
      "GRAPH_BROKEN_LINK",
      `Unresolved link target "${anchor}": ${reason}`,
      { anchor, reason },
    );
  }

  static llmRateLimited(model: string, retryAfterMs?: number): AgdsError {
    return new AgdsError(
      "LLM_RATE_LIMITED",
      `LLM model "${model}" is rate-limited.`,
      { model, retryAfterMs },
    );
  }

  static queryWriteForbidden(cypher: string): AgdsError {
    return new AgdsError(
      "QUERY_WRITE_FORBIDDEN",
      "Write Cypher is not allowed in read-only query mode. Pass { write: true } to opt in.",
      { cypher },
    );
  }

  static resolveNotFound(ref: string, trail: readonly string[]): AgdsError {
    return new AgdsError(
      "RESOLVE_NOT_FOUND",
      `Could not resolve link target "${ref}".`,
      { ref, trail },
    );
  }

  static lockConflict(scope: string, holder: string): AgdsError {
    return new AgdsError(
      "LOCK_CONFLICT",
      `Advisory lock "${scope}" is held by "${holder}".`,
      { scope, holder },
    );
  }

  static managedSectionConflict(docId: string, section: string): AgdsError {
    return new AgdsError(
      "MANAGED_SECTION_CONFLICT",
      `Managed section "${section}" in document "${docId}" contains hand-written content.`,
      { docId, section },
    );
  }
}
