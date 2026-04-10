import type { DocumentBlob, DocumentRef, DocumentStat } from "../types/document.js";

/** Capabilities advertised by a DocumentStore adapter. */
export interface DocumentStoreCapabilities {
  /**
   * True when the store provides a key that is stable across renames
   * (e.g. a database primary key or a user-assigned UUID).
   * False for stores where the key is derived from a mutable attribute
   * such as a file path.
   */
  stableKeys: boolean;
  /**
   * Present when the store is backed by a version-control system.
   * The sync service uses this to prefer VCS-native rename detection.
   */
  vcs?: "git";
}

/**
 * Read-only contract for accessing Markdown documents from a storage backend.
 *
 * Implementations must be idempotent and side-effect-free.
 * All mutation of persisted state happens through the GraphStore; the
 * DocumentStore is the *source of truth* for raw document bytes.
 */
export interface DocumentStore {
  /** Unique identifier for this adapter instance (matches Document.storeId). */
  readonly storeId: string;
  readonly capabilities: DocumentStoreCapabilities;

  /**
   * Enumerate all document references in the given vault.
   * The stream may be infinite; callers must handle back-pressure.
   */
  list(vaultId: string): AsyncIterable<DocumentRef>;

  /** Read the full body and stat for a document. */
  read(ref: DocumentRef): Promise<DocumentBlob>;

  /** Read only the stat block for a document (cheaper than a full read). */
  stat(ref: DocumentRef): Promise<DocumentStat>;

  /**
   * Resolve a raw link target string (as written in a document) to the
   * canonical DocumentRef it points at, or null when the target cannot
   * be resolved.
   *
   * @param from  The document that contains the link.
   * @param rawTarget  The raw target string from the link token.
   */
  resolveLinkTarget(
    from: DocumentRef,
    rawTarget: string,
  ): Promise<DocumentRef | null>;

  /**
   * Produce the store-canonical string representation of a link target.
   * The result is written verbatim into document link tokens by the rewriter.
   *
   * @param from  The document that will contain the link.
   * @param to    The document being linked to.
   */
  formatLinkTarget(from: DocumentRef, to: DocumentRef): string;
}
