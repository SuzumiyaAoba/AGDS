import { AgdsError } from "../errors/agds-error.js";
import type { BrokenLink } from "../types/broken-link.js";
import type { Document } from "../types/document.js";
import type { SemanticEdge } from "../types/edge.js";
import type { Heading } from "../types/heading.js";
import type { DocumentId, OccurrenceKey, PublicId } from "../types/identity.js";
import type { Tag } from "../types/tag.js";
import type { GraphStore } from "../ports/graph-store.js";

interface LockEntry {
  holder: string;
  expiresAt: Date;
}

/**
 * Volatile in-memory implementation of GraphStore for use in unit tests.
 *
 * - All state is lost when the instance is discarded.
 * - `query()` is not supported and always throws.
 * - Lock expiry is evaluated at acquisition time using `Date.now()`.
 */
export class InMemoryGraphStore implements GraphStore {
  private readonly documents = new Map<DocumentId, Document>();
  /** vaultId -> publicId -> DocumentId */
  private readonly publicIdIndex = new Map<string, Map<string, DocumentId>>();
  /** vaultId -> storeId -> storeKey -> DocumentId */
  private readonly refIndex = new Map<
    string,
    Map<string, Map<string, DocumentId>>
  >();

  private readonly headings = new Map<DocumentId, Heading[]>();
  private readonly tags = new Map<DocumentId, Tag[]>();
  private readonly edges = new Map<OccurrenceKey, SemanticEdge>();
  private readonly brokenLinks = new Map<OccurrenceKey, BrokenLink>();
  private readonly locks = new Map<string, LockEntry>();

  // ── Document ──────────────────────────────────────────────────────────────

  async upsertDocument(doc: Document): Promise<void> {
    const previous = this.documents.get(doc.id);
    this.documents.set(doc.id, doc);

    // Update ref index
    let byStore = this.refIndex.get(doc.vaultId);
    if (byStore === undefined) {
      byStore = new Map();
      this.refIndex.set(doc.vaultId, byStore);
    }
    let byKey = byStore.get(doc.storeId);
    if (byKey === undefined) {
      byKey = new Map();
      byStore.set(doc.storeId, byKey);
    }
    byKey.set(doc.storeKey, doc.id);

    // Update publicId index
    let byVault = this.publicIdIndex.get(doc.vaultId);
    if (byVault === undefined) {
      byVault = new Map();
      this.publicIdIndex.set(doc.vaultId, byVault);
    }
    if (previous?.publicId !== undefined && previous.publicId !== doc.publicId) {
      byVault.delete(previous.publicId);
    }
    if (doc.publicId !== undefined) {
      const existing = byVault.get(doc.publicId);
      if (existing !== undefined && existing !== doc.id) {
        throw AgdsError.publicIdConflict(existing, doc.publicId);
      }
      byVault.set(doc.publicId, doc.id);
    }
  }

  async archiveDocument(id: DocumentId): Promise<void> {
    const doc = this.documents.get(id);
    if (doc === undefined) return;
    if (doc.publicId !== undefined) {
      this.publicIdIndex.get(doc.vaultId)?.delete(doc.publicId);
    }
    this.documents.set(id, { ...doc, archived: true });
  }

  async findDocumentById(id: DocumentId): Promise<Document | null> {
    return this.documents.get(id) ?? null;
  }

  async findDocumentByRef(
    vaultId: string,
    storeId: string,
    storeKey: string,
  ): Promise<Document | null> {
    const id = this.refIndex.get(vaultId)?.get(storeId)?.get(storeKey);
    if (id === undefined) return null;
    return this.documents.get(id) ?? null;
  }

  async findDocumentByPublicId(
    vaultId: string,
    publicId: PublicId,
  ): Promise<Document | null> {
    const id = this.publicIdIndex.get(vaultId)?.get(publicId);
    if (id === undefined) return null;
    const doc = this.documents.get(id);
    if (doc === undefined || doc.archived) return null;
    return doc;
  }

  async listDocuments(vaultId: string): Promise<Document[]> {
    const results: Document[] = [];
    for (const doc of this.documents.values()) {
      if (doc.vaultId === vaultId && !doc.archived) {
        results.push(doc);
      }
    }
    return results;
  }

  // ── Heading ───────────────────────────────────────────────────────────────

  async upsertHeadings(
    docId: DocumentId,
    headings: readonly Heading[],
  ): Promise<void> {
    this.headings.set(docId, [...headings]);
  }

  // ── Tag ───────────────────────────────────────────────────────────────────

  async upsertTags(docId: DocumentId, tags: readonly Tag[]): Promise<void> {
    this.tags.set(docId, [...tags]);
  }

  // ── Semantic edges ────────────────────────────────────────────────────────

  async upsertSemanticEdge(edge: SemanticEdge): Promise<void> {
    this.edges.set(edge.occurrenceKey, edge);
  }

  async deleteSemanticEdge(occurrenceKey: OccurrenceKey): Promise<void> {
    this.edges.delete(occurrenceKey);
  }

  async listEdgesFrom(docId: DocumentId): Promise<SemanticEdge[]> {
    const results: SemanticEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceDocId === docId) results.push(edge);
    }
    return results;
  }

  async listEdgesTo(docId: DocumentId): Promise<SemanticEdge[]> {
    const results: SemanticEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.targetDocId === docId) results.push(edge);
    }
    return results;
  }

  // ── Broken links ──────────────────────────────────────────────────────────

  async upsertBrokenLink(link: BrokenLink): Promise<void> {
    this.brokenLinks.set(link.occurrenceKey, link);
  }

  async deleteBrokenLink(occurrenceKey: OccurrenceKey): Promise<void> {
    this.brokenLinks.delete(occurrenceKey);
  }

  async listBrokenLinksFrom(docId: DocumentId): Promise<BrokenLink[]> {
    const results: BrokenLink[] = [];
    for (const link of this.brokenLinks.values()) {
      if (link.sourceDocId === docId) results.push(link);
    }
    return results;
  }

  // ── Advisory locks ────────────────────────────────────────────────────────

  async acquireLock(
    scope: string,
    holder: string,
    ttlMs: number,
  ): Promise<void> {
    const now = new Date();
    const existing = this.locks.get(scope);
    if (existing !== undefined && existing.expiresAt > now) {
      if (existing.holder !== holder) {
        throw AgdsError.lockConflict(scope, existing.holder);
      }
      // Same holder re-acquires: extend TTL.
    }
    this.locks.set(scope, {
      holder,
      expiresAt: new Date(now.getTime() + ttlMs),
    });
  }

  async releaseLock(scope: string): Promise<void> {
    this.locks.delete(scope);
  }

  // ── Cypher query ──────────────────────────────────────────────────────────

  async query<T = unknown>(
    _cypher: string,
    _params?: Record<string, unknown>,
  ): Promise<T[]> {
    throw new Error(
      "InMemoryGraphStore does not support Cypher queries. " +
        "Use the structured methods or a real Neo4j-backed store.",
    );
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /** Return the headings stored for a document (for test assertions). */
  getHeadings(docId: DocumentId): Heading[] {
    return this.headings.get(docId) ?? [];
  }

  /** Return the tags stored for a document (for test assertions). */
  getTags(docId: DocumentId): Tag[] {
    return this.tags.get(docId) ?? [];
  }

  /** Return the broken links stored for a document (for test assertions). */
  getBrokenLinks(docId: DocumentId): BrokenLink[] {
    return [...this.brokenLinks.values()].filter(
      (link) => link.sourceDocId === docId,
    );
  }
}
