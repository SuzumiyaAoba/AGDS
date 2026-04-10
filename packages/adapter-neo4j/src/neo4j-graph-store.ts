import neo4j, { type Driver, type Session } from "neo4j-driver";
import { z } from "zod";
import {
  DocumentSchema,
  SemanticEdgeSchema,
} from "@agds/schema";
import type {
  BrokenLink,
  Document,
  DocumentId,
  GraphStore,
  Heading,
  OccurrenceKey,
  PublicId,
  SemanticEdge,
  Tag,
} from "@agds/core";
import {
  AgdsError,
  toOccurrenceKey,
  toPublicId,
} from "@agds/core";
import * as Q from "./cypher.js";

export interface Neo4jGraphStoreOptions {
  /** Bolt connection URI, e.g. `bolt://localhost:7687`. */
  url: string;
  username: string;
  password: string;
  /** Neo4j database name. Defaults to `"neo4j"`. */
  database?: string;
}

const IsoDateStringSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const OptionalStringSchema = z.preprocess(
  (value: unknown) => (value === null ? undefined : value),
  z.string().optional(),
);

const OptionalNumberSchema = z.preprocess(
  (value: unknown) => (value === null ? undefined : value),
  z.number().optional(),
);

const Neo4jIntegerSchema = z.preprocess((value: unknown) => {
  if (hasToNumber(value)) {
    return value.toNumber();
  }
  return value;
}, z.number());

const Neo4jNodePropertiesSchema = z.record(z.string(), z.unknown());

const ParsedNeo4jDocumentSchema = z.object({
  id: z.string().length(16),
  publicId: OptionalStringSchema,
  vaultId: DocumentSchema.shape.vaultId,
  storeId: DocumentSchema.shape.storeId,
  storeKey: DocumentSchema.shape.storeKey,
  path: OptionalStringSchema,
  title: DocumentSchema.shape.title,
  hash: DocumentSchema.shape.hash,
  bytes: Neo4jIntegerSchema.pipe(z.number().int().nonnegative()),
  storeVersion: DocumentSchema.shape.storeVersion,
  updatedAt: IsoDateStringSchema,
  summary: OptionalStringSchema,
  archived: z.boolean(),
  schemaVersion: Neo4jIntegerSchema.pipe(z.number().int().nonnegative()),
});

const ParsedNeo4jSemanticEdgeSchema = z.object({
  occurrenceKey: z.string().min(1),
  sourceDocId: z.string().length(16),
  targetDocId: z.string().length(16),
  type: SemanticEdgeSchema.shape.type,
  source: SemanticEdgeSchema.shape.source,
  status: SemanticEdgeSchema.shape.status,
  confidence: OptionalNumberSchema.pipe(
    z.number().min(0).max(1).optional(),
  ),
  rationale: OptionalStringSchema,
  anchor: OptionalStringSchema,
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
  model: OptionalStringSchema,
});

const ParsedNeo4jBrokenLinkSchema = z.object({
  occurrenceKey: z.string().min(1),
  sourceDocId: z.string().length(16),
  rawTarget: z.string(),
  anchor: OptionalStringSchema,
  reason: z.string().min(1),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});

const ParsedNeo4jHeadingSchema = z.object({
  id: z.string().min(1),
  docId: z.string().length(16),
  level: Neo4jIntegerSchema.pipe(z.number().int().min(1).max(6)),
  text: z.string(),
  slug: z.string(),
  order: Neo4jIntegerSchema.pipe(z.number().int().nonnegative()),
});

const ParsedNeo4jTagSchema = z.object({
  name: z.string().min(1),
});

const LockRecordSchema = z.object({
  holder: z.string().min(1),
  expiresAt: IsoDateStringSchema,
});

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
      const version = z.string().min(1).parse(result.records[0]?.get("version"));
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

  // ── Broken links ──────────────────────────────────────────────────────────

  async upsertBrokenLink(link: BrokenLink): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.UPSERT_BROKEN_LINK, {
        occurrenceKey: link.occurrenceKey,
        sourceDocId: link.sourceDocId,
        rawTarget: link.rawTarget,
        anchor: link.anchor ?? null,
        reason: link.reason,
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      });
    } finally {
      await session.close();
    }
  }

  async deleteBrokenLink(occurrenceKey: OccurrenceKey): Promise<void> {
    const session = this.writeSession();
    try {
      await session.run(Q.DELETE_BROKEN_LINK, { occurrenceKey });
    } finally {
      await session.close();
    }
  }

  async listBrokenLinksFrom(docId: DocumentId): Promise<BrokenLink[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_BROKEN_LINKS_FROM, { docId });
      return result.records.map(recordToBrokenLink);
    } finally {
      await session.close();
    }
  }

  async listHeadingsForDocument(docId: DocumentId): Promise<Heading[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_HEADINGS_FOR_DOCUMENT, { docId });
      return result.records.map(recordToHeading);
    } finally {
      await session.close();
    }
  }

  async listOrphanedHeadings(): Promise<Heading[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_ORPHANED_HEADINGS);
      return result.records.map(recordToHeading);
    } finally {
      await session.close();
    }
  }

  async listOrphanedTags(): Promise<Tag[]> {
    const session = this.readSession();
    try {
      const result = await session.run(Q.LIST_ORPHANED_TAGS);
      return result.records.map(recordToTag);
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
      const { holder: actualHolder, expiresAt: actualExpiry } = LockRecordSchema.parse({
        holder: record.get("holder"),
        expiresAt: record.get("expiresAt"),
      });
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
  const properties = Neo4jNodePropertiesSchema.parse(node.properties);
  const parsed = ParsedNeo4jDocumentSchema.parse({
    id: properties["id"],
    publicId: properties["publicId"],
    vaultId: properties["vaultId"],
    storeId: properties["storeId"],
    storeKey: properties["storeKey"],
    path: properties["path"],
    title: properties["title"],
    hash: properties["hash"],
    bytes: properties["bytes"],
    storeVersion: properties["storeVersion"],
    updatedAt: properties["updatedAt"],
    summary: properties["summary"],
    archived: properties["archived"],
    schemaVersion: properties["schemaVersion"],
  });
  const document: Document = {
    id: wrapDocumentId(parsed.id),
    vaultId: parsed.vaultId,
    storeId: parsed.storeId,
    storeKey: parsed.storeKey,
    title: parsed.title,
    hash: parsed.hash,
    bytes: parsed.bytes,
    storeVersion: parsed.storeVersion,
    updatedAt: parsed.updatedAt,
    archived: parsed.archived,
    schemaVersion: parsed.schemaVersion,
  };
  if (parsed.publicId !== undefined) document.publicId = toPublicId(parsed.publicId);
  if (parsed.path !== undefined) document.path = parsed.path;
  if (parsed.summary !== undefined) document.summary = parsed.summary;
  return document;
}

function recordToEdge(record: { get: (key: string) => unknown }): SemanticEdge {
  const parsed = ParsedNeo4jSemanticEdgeSchema.parse({
    occurrenceKey: record.get("occurrenceKey"),
    sourceDocId: record.get("sourceDocId"),
    targetDocId: record.get("targetDocId"),
    type: record.get("type"),
    source: record.get("source"),
    status: record.get("status"),
    confidence: record.get("confidence"),
    rationale: record.get("rationale"),
    anchor: record.get("anchor"),
    createdAt: record.get("createdAt"),
    updatedAt: record.get("updatedAt"),
    model: record.get("model"),
  });
  const edge: SemanticEdge = {
    occurrenceKey: toOccurrenceKey(parsed.occurrenceKey),
    sourceDocId: wrapDocumentId(parsed.sourceDocId),
    targetDocId: wrapDocumentId(parsed.targetDocId),
    type: parsed.type,
    source: parsed.source,
    status: parsed.status,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
  if (parsed.confidence !== undefined) edge.confidence = parsed.confidence;
  if (parsed.rationale !== undefined) edge.rationale = parsed.rationale;
  if (parsed.anchor !== undefined) edge.anchor = parsed.anchor;
  if (parsed.model !== undefined) edge.model = parsed.model;
  return edge;
}

function recordToBrokenLink(record: { get: (key: string) => unknown }): BrokenLink {
  const parsed = ParsedNeo4jBrokenLinkSchema.parse({
    occurrenceKey: record.get("occurrenceKey"),
    sourceDocId: record.get("sourceDocId"),
    rawTarget: record.get("rawTarget"),
    anchor: record.get("anchor"),
    reason: record.get("reason"),
    createdAt: record.get("createdAt"),
    updatedAt: record.get("updatedAt"),
  });
  const link: BrokenLink = {
    occurrenceKey: toOccurrenceKey(parsed.occurrenceKey),
    sourceDocId: wrapDocumentId(parsed.sourceDocId),
    rawTarget: parsed.rawTarget,
    reason: parsed.reason,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
  if (parsed.anchor !== undefined) link.anchor = parsed.anchor;
  return link;
}

function recordToHeading(record: { get: (key: string) => unknown }): Heading {
  const parsed = ParsedNeo4jHeadingSchema.parse({
    id: record.get("id"),
    docId: record.get("docId"),
    level: record.get("level"),
    text: record.get("text"),
    slug: record.get("slug"),
    order: record.get("order"),
  });
  return {
    id: parsed.id,
    docId: wrapDocumentId(parsed.docId),
    level: parsed.level,
    text: parsed.text,
    slug: parsed.slug,
    order: parsed.order,
  };
}

function recordToTag(record: { get: (key: string) => unknown }): Tag {
  const parsed = ParsedNeo4jTagSchema.parse({
    name: record.get("name"),
  });
  return { name: parsed.name };
}

function wrapDocumentId(raw: string): DocumentId {
  return raw as DocumentId;
}

function hasToNumber(value: unknown): value is { toNumber(): number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "toNumber") === "function"
  );
}
