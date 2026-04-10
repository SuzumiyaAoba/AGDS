import neo4j, { type Driver, type Session } from "neo4j-driver";
import type {
  Document,
  DocumentId,
  GraphStore,
  Heading,
  OccurrenceKey,
  PublicId,
  SemanticEdge,
  Tag,
} from "@agds/core";
import { AgdsError } from "@agds/core";
import * as Q from "./cypher.js";

export interface Neo4jGraphStoreOptions {
  /** Bolt connection URI, e.g. `bolt://localhost:7687`. */
  url: string;
  username: string;
  password: string;
  /** Neo4j database name. Defaults to `"neo4j"`. */
  database?: string;
}

/**
 * Neo4j-backed implementation of `GraphStore`.
 *
 * All writes use write sessions; reads use read sessions.
 * Semantic edge upserts require APOC Core (`apoc.merge.relationship`).
 *
 * Call `close()` when the store is no longer needed to release the driver.
 */
export class Neo4jGraphStore implements GraphStore {
  private readonly driver: Driver;
  private readonly database: string;

  constructor(opts: Neo4jGraphStoreOptions) {
    this.driver = neo4j.driver(
      opts.url,
      neo4j.auth.basic(opts.username, opts.password),
    );
    this.database = opts.database ?? "neo4j";
  }

  /** Verify connectivity and APOC availability. Throws on failure. */
  async verifyConnectivity(): Promise<{ apocVersion: string }> {
    await this.driver.verifyConnectivity();
    const session = this.readSession();
    try {
      const result = await session.run(Q.CHECK_APOC);
      const version = result.records[0]?.get("version") as string;
      return { apocVersion: version };
    } finally {
      await session.close();
    }
  }

  /** Close the underlying driver connection pool. */
  async close(): Promise<void> {
    await this.driver.close();
  }

  // ── Document ──────────────────────────────────────────────────────────────

  async upsertDocument(doc: Document): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.UPSERT_DOCUMENT, {
        id: doc.id,
        publicId: doc.publicId ?? null,
        vaultId: doc.vaultId,
        storeId: doc.storeId,
        storeKey: doc.storeKey,
        path: doc.path ?? null,
        title: doc.title,
        hash: doc.hash,
        bytes: neo4j.int(doc.bytes),
        storeVersion: doc.storeVersion,
        updatedAt: doc.updatedAt.toISOString(),
        summary: doc.summary ?? null,
        schemaVersion: neo4j.int(doc.schemaVersion),
      });
    } finally {
      await session.close();
    }
  }

  async archiveDocument(id: DocumentId): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.ARCHIVE_DOCUMENT, { id });
    } finally {
      await session.close();
    }
  }

  async findDocumentById(id: DocumentId): Promise<Document | null> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.FIND_DOCUMENT_BY_ID, { id });
      return result.records[0] ? recordToDocument(result.records[0].get("d")) : null;
    } finally {
      await session.close();
    }
  }

  async findDocumentByRef(
    vaultId: string,
    storeId: string,
    storeKey: string,
  ): Promise<Document | null> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.FIND_DOCUMENT_BY_REF, {
        vaultId,
        storeId,
        storeKey,
      });
      return result.records[0] ? recordToDocument(result.records[0].get("d")) : null;
    } finally {
      await session.close();
    }
  }

  async findDocumentByPublicId(
    vaultId: string,
    publicId: PublicId,
  ): Promise<Document | null> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.FIND_DOCUMENT_BY_PUBLIC_ID, {
        vaultId,
        publicId,
      });
      return result.records[0] ? recordToDocument(result.records[0].get("d")) : null;
    } finally {
      await session.close();
    }
  }

  async listDocuments(vaultId: string): Promise<Document[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_DOCUMENTS, { vaultId });
      return result.records.map((r) => recordToDocument(r.get("d")));
    } finally {
      await session.close();
    }
  }

  // ── Heading ───────────────────────────────────────────────────────────────

  async upsertHeadings(docId: DocumentId, headings: readonly Heading[]): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.REPLACE_HEADINGS, {
        docId,
        headings: headings.map((h) => ({
          id: h.id,
          level: neo4j.int(h.level),
          text: h.text,
          slug: h.slug,
          order: neo4j.int(h.order),
        })),
      });
    } finally {
      await session.close();
    }
  }

  // ── Tag ───────────────────────────────────────────────────────────────────

  async upsertTags(docId: DocumentId, tags: readonly Tag[]): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.REPLACE_TAGS, {
        docId,
        tags: tags.map((t) => t.name),
      });
    } finally {
      await session.close();
    }
  }

  // ── Semantic edges ────────────────────────────────────────────────────────

  async upsertSemanticEdge(edge: SemanticEdge): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.UPSERT_SEMANTIC_EDGE, {
        sourceDocId: edge.sourceDocId,
        targetDocId: edge.targetDocId,
        type: edge.type,
        occurrenceKey: edge.occurrenceKey,
        source: edge.source,
        status: edge.status,
        confidence: edge.confidence ?? null,
        rationale: edge.rationale ?? null,
        anchor: edge.anchor ?? null,
        createdAt: edge.createdAt.toISOString(),
        updatedAt: edge.updatedAt.toISOString(),
        model: edge.model ?? null,
      });
    } finally {
      await session.close();
    }
  }

  async deleteSemanticEdge(occurrenceKey: OccurrenceKey): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.DELETE_SEMANTIC_EDGE, { occurrenceKey });
    } finally {
      await session.close();
    }
  }

  async listEdgesFrom(docId: DocumentId): Promise<SemanticEdge[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_EDGES_FROM, { docId });
      return result.records.map(recordToEdge);
    } finally {
      await session.close();
    }
  }

  async listEdgesTo(docId: DocumentId): Promise<SemanticEdge[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_EDGES_TO, { docId });
      return result.records.map(recordToEdge);
    } finally {
      await session.close();
    }
  }

  // ── Advisory locks ────────────────────────────────────────────────────────

  async acquireLock(scope: string, holder: string, ttlMs: number): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const session = this.writeSession();
    try {
      const result = await session.run(Q.ACQUIRE_LOCK, {
        scope,
        holder,
        now: now.toISOString(),
        acquiredAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      const record = result.records[0];
      if (record === undefined) return;
      const actualHolder = record.get("holder") as string;
      const actualExpiry = new Date(record.get("expiresAt") as string);
      if (actualHolder !== holder && actualExpiry > now) {
        throw AgdsError.lockConflict(scope, actualHolder);
      }
    } finally {
      await session.close();
    }
  }

  async releaseLock(scope: string): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.RELEASE_LOCK, { scope });
    } finally {
      await session.close();
    }
  }

  // ── Cypher query ──────────────────────────────────────────────────────────

  async query<T = unknown>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const session = this.readSession();
    try {
      const result = await session.run(cypher, params ?? {});
      return result.records.map((r) => r.toObject() as T);
    } finally {
      await session.close();
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private readSession(): Session {
    return this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
  }

  private writeSession(): Session {
    return this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.WRITE });
  }
}

// ── Record mappers ────────────────────────────────────────────────────────────

function recordToDocument(node: { properties: Record<string, unknown> }): Document {
  const p = node.properties;
  return {
    id: p["id"] as DocumentId,
    publicId: (p["publicId"] as string | null) ?? undefined,
    vaultId: p["vaultId"] as string,
    storeId: p["storeId"] as string,
    storeKey: p["storeKey"] as string,
    path: (p["path"] as string | null) ?? undefined,
    title: p["title"] as string,
    hash: p["hash"] as string,
    bytes: toNumber(p["bytes"]),
    storeVersion: p["storeVersion"] as string,
    updatedAt: new Date(p["updatedAt"] as string),
    summary: (p["summary"] as string | null) ?? undefined,
    archived: p["archived"] as boolean,
    schemaVersion: toNumber(p["schemaVersion"]),
  } as Document;
}

function recordToEdge(record: { get: (key: string) => unknown }): SemanticEdge {
  return {
    occurrenceKey: record.get("occurrenceKey") as OccurrenceKey,
    sourceDocId: record.get("sourceDocId") as DocumentId,
    targetDocId: record.get("targetDocId") as DocumentId,
    type: record.get("type") as string,
    source: record.get("source") as SemanticEdge["source"],
    status: record.get("status") as SemanticEdge["status"],
    confidence: (record.get("confidence") as number | null) ?? undefined,
    rationale: (record.get("rationale") as string | null) ?? undefined,
    anchor: (record.get("anchor") as string | null) ?? undefined,
    createdAt: new Date(record.get("createdAt") as string),
    updatedAt: new Date(record.get("updatedAt") as string),
    model: (record.get("model") as string | null) ?? undefined,
  } as SemanticEdge;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  // neo4j-driver Integer type
  if (typeof v === "object" && "toNumber" in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v);
}
