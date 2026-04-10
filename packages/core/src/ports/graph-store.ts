import type { Document } from "../types/document.js";
import type { BrokenLink } from "../types/broken-link.js";
import type { SemanticEdge } from "../types/edge.js";
import type { Heading } from "../types/heading.js";
import type { DocumentId, OccurrenceKey, PublicId } from "../types/identity.js";
import type { Tag } from "../types/tag.js";

/** Advisory lock descriptor stored in the graph. */
export interface GraphLock {
  scope: string;
  holder: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Persistence contract for all AGDS graph state.
 *
 * A GraphStore implementation may be backed by Neo4j, an in-memory map,
 * or any future store. The contract is intentionally coarse-grained so
 * that service code stays portable.
 *
 * Mutation methods are idempotent unless otherwise noted.
 * Read methods never mutate graph state.
 */
export interface GraphStore {
  // ── Document ──────────────────────────────────────────────────────────────

  /** Insert or update a document node. Idempotent on (vaultId, storeKey). */
  upsertDocument(doc: Document): Promise<void>;

  /**
   * Mark a document as archived without removing it.
   * Preserves edges for history.
   */
  archiveDocument(id: DocumentId): Promise<void>;

  /** Look up a document by its stable internal id. */
  findDocumentById(id: DocumentId): Promise<Document | null>;

  /** Look up a document by its store-level coordinates. */
  findDocumentByRef(
    vaultId: string,
    storeId: string,
    storeKey: string,
  ): Promise<Document | null>;

  /**
   * Look up a document by its user-facing publicId.
   * Returns null when no live (non-archived) document holds the id.
   */
  findDocumentByPublicId(
    vaultId: string,
    publicId: PublicId,
  ): Promise<Document | null>;

  /** Return all non-archived documents in the vault. */
  listDocuments(vaultId: string): Promise<Document[]>;

  // ── Heading ───────────────────────────────────────────────────────────────

  /**
   * Replace all heading nodes for a document with the provided set.
   * Removes headings that are no longer present.
   */
  upsertHeadings(docId: DocumentId, headings: readonly Heading[]): Promise<void>;

  // ── Tag ───────────────────────────────────────────────────────────────────

  /**
   * Replace all tag associations for a document with the provided set.
   * Creates Tag nodes when they do not already exist.
   */
  upsertTags(docId: DocumentId, tags: readonly Tag[]): Promise<void>;

  // ── Semantic edges ────────────────────────────────────────────────────────

  /**
   * Insert or update a semantic edge.
   * Identity is determined by (sourceDocId, targetDocId, type, occurrenceKey).
   */
  upsertSemanticEdge(edge: SemanticEdge): Promise<void>;

  /** Remove a semantic edge by its occurrenceKey. No-op if not found. */
  deleteSemanticEdge(occurrenceKey: OccurrenceKey): Promise<void>;

  /** Return all semantic edges whose source is the given document. */
  listEdgesFrom(docId: DocumentId): Promise<SemanticEdge[]>;

  /** Return all semantic edges whose target is the given document. */
  listEdgesTo(docId: DocumentId): Promise<SemanticEdge[]>;

  // ── Broken links ──────────────────────────────────────────────────────────

  /**
   * Insert or update a broken-link edge.
   * Identity is determined by (sourceDocId, rawTarget, occurrenceKey).
   */
  upsertBrokenLink(link: BrokenLink): Promise<void>;

  /** Remove a broken-link edge by its occurrenceKey. No-op if not found. */
  deleteBrokenLink(occurrenceKey: OccurrenceKey): Promise<void>;

  /** Return all broken-link edges whose source is the given document. */
  listBrokenLinksFrom(docId: DocumentId): Promise<BrokenLink[]>;

  /** Return all heading nodes attached to the given document. */
  listHeadingsForDocument(docId: DocumentId): Promise<Heading[]>;

  /**
   * Return heading records that are not attached to any document node.
   *
   * This is primarily used by integrity verification.
   */
  listOrphanedHeadings(): Promise<Heading[]>;

  /**
   * Return tag records that are not attached to any document node.
   *
   * This is primarily used by integrity verification.
   */
  listOrphanedTags(): Promise<Tag[]>;

  // ── Advisory locks ────────────────────────────────────────────────────────

  /**
   * Acquire an advisory lock for the given scope.
   * Throws `AgdsError(LOCK_CONFLICT)` when the scope is already locked
   * by a different holder and has not yet expired.
   *
   * @param scope     Logical operation name, e.g. `"write"`.
   * @param holder    Identifier for the current process / session.
   * @param ttlMs     Lock TTL in milliseconds. Expired locks are preempted.
   */
  acquireLock(scope: string, holder: string, ttlMs: number): Promise<void>;

  /** Release the advisory lock for the given scope. No-op if not held. */
  releaseLock(scope: string): Promise<void>;

  // ── Cypher query ──────────────────────────────────────────────────────────

  /**
   * Execute a raw Cypher query and return the result rows.
   * Write queries must be rejected by read-only store implementations.
   *
   * @param cypher  The Cypher statement.
   * @param params  Named parameters passed to the query.
   */
  query<T = unknown>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
}
