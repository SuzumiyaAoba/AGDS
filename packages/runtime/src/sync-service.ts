import {
  createDocumentId,
  parseDocument,
  toPublicId,
  type BrokenLink,
  type Document,
  type DocumentRef,
  type DocumentStat,
  type DocumentStore,
  type GraphStore,
  type ParsedDocument,
  type SemanticEdge,
  type Tag,
} from "@agds/core";

const DEFAULT_LOCK_SCOPE = "write";
const DEFAULT_LOCK_TTL_MS = 60_000;
const DEFAULT_SCHEMA_VERSION = 1;
const BROKEN_LINK_REASON = "UNRESOLVED_TARGET";

export interface SyncServiceOptions {
  vaultId: string;
  store: DocumentStore;
  graph: GraphStore;
  holder?: string;
  lockTtlMs?: number;
  schemaVersion?: number;
  defaultExplicitType?: string;
  defaultSuggestionType?: string;
  now?: () => Date;
}

export interface SyncSummary {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  edgesUpserted: number;
  edgesDeleted: number;
  brokenLinksUpserted: number;
  brokenLinksDeleted: number;
}

interface PreparedSyncDocument {
  ref: DocumentRef;
  document: Document;
  parsed: ParsedDocument;
}

export class SyncService {
  private readonly vaultId: string;
  private readonly store: DocumentStore;
  private readonly graph: GraphStore;
  private readonly holder: string;
  private readonly lockTtlMs: number;
  private readonly schemaVersion: number;
  private readonly defaultExplicitType: string | undefined;
  private readonly defaultSuggestionType: string | undefined;
  private readonly now: () => Date;

  constructor(opts: SyncServiceOptions) {
    this.vaultId = opts.vaultId;
    this.store = opts.store;
    this.graph = opts.graph;
    this.holder = opts.holder ?? `sync:${process.pid}`;
    this.lockTtlMs = opts.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.schemaVersion = opts.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
    this.defaultExplicitType = opts.defaultExplicitType;
    this.defaultSuggestionType = opts.defaultSuggestionType;
    this.now = opts.now ?? (() => new Date());
  }

  async sync(): Promise<SyncSummary> {
    await this.graph.acquireLock(
      DEFAULT_LOCK_SCOPE,
      this.holder,
      this.lockTtlMs,
    );

    try {
      return await this.syncUnlocked();
    } finally {
      await this.graph.releaseLock(DEFAULT_LOCK_SCOPE);
    }
  }

  private async syncUnlocked(): Promise<SyncSummary> {
    const summary: SyncSummary = {
      scanned: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      archived: 0,
      edgesUpserted: 0,
      edgesDeleted: 0,
      brokenLinksUpserted: 0,
      brokenLinksDeleted: 0,
    };
    const existingDocs = await this.graph.listDocuments(this.vaultId);
    const existingByStoreKey = new Map(
      existingDocs.map((doc) => [doc.storeKey, doc] as const),
    );
    const seenStoreKeys = new Set<string>();
    const prepared: PreparedSyncDocument[] = [];

    for await (const ref of this.store.list(this.vaultId)) {
      summary.scanned += 1;
      seenStoreKeys.add(ref.storeKey);

      const existing = existingByStoreKey.get(ref.storeKey);
      const stat = await this.store.stat(ref);
      const blob = await this.store.read(ref);
      const item = this.prepareDocument(ref, blob.body, blob.stat, existing);
      prepared.push(item);

      const isUnchanged =
        existing !== undefined &&
        existing.hash === stat.hash &&
        existing.storeVersion === stat.storeVersion;

      if (isUnchanged) {
        summary.unchanged += 1;
        continue;
      }

      await this.graph.upsertDocument(item.document);
      await this.graph.upsertHeadings(item.document.id, item.parsed.headings);
      await this.graph.upsertTags(
        item.document.id,
        normalizeTags(item.parsed.agds.tags),
      );

      if (existing === undefined) {
        summary.created += 1;
      } else {
        summary.updated += 1;
      }
    }

    for (const doc of existingDocs) {
      if (!seenStoreKeys.has(doc.storeKey)) {
        await this.graph.archiveDocument(doc.id);
        summary.archived += 1;
      }
    }

    for (const item of prepared) {
      await this.reconcileLinks(item, summary);
    }

    return summary;
  }

  private prepareDocument(
    ref: DocumentRef,
    raw: string,
    stat: DocumentStat,
    existing?: Document,
  ): PreparedSyncDocument {
    const id = existing?.id ?? createDocumentId(this.vaultId, ref.storeKey);
    const parseOptions: Parameters<typeof parseDocument>[1] = { docId: id };
    if (this.defaultExplicitType !== undefined) {
      parseOptions.defaultExplicitType = this.defaultExplicitType;
    }
    if (this.defaultSuggestionType !== undefined) {
      parseOptions.defaultSuggestionType = this.defaultSuggestionType;
    }
    const parsed = parseDocument(raw, parseOptions);

    const document: Document = {
      id,
      vaultId: this.vaultId,
      storeId: ref.storeId,
      storeKey: ref.storeKey,
      title: deriveTitle(ref, parsed),
      hash: stat.hash,
      bytes: stat.bytes,
      storeVersion: stat.storeVersion,
      updatedAt: this.now(),
      archived: false,
      schemaVersion: this.schemaVersion,
    };

    if (parsed.agds.id !== undefined) {
      document.publicId = toPublicId(parsed.agds.id);
    }
    if (ref.path !== undefined) {
      document.path = ref.path;
    }
    if (parsed.agds.summary !== undefined) {
      document.summary = parsed.agds.summary;
    }

    return { ref, document, parsed };
  }

  private async reconcileLinks(
    item: PreparedSyncDocument,
    summary: SyncSummary,
  ): Promise<void> {
    const now = this.now();
    const currentEdges = (await this.graph.listEdgesFrom(item.document.id)).filter(
      (edge) =>
        (edge.status === "active" || edge.status === "pending") &&
        (edge.source === "explicit" || edge.source === "llm"),
    );
    const currentBrokenLinks = await this.graph.listBrokenLinksFrom(
      item.document.id,
    );

    const currentEdgesByKey = new Map(
      currentEdges.map((edge) => [edge.occurrenceKey, edge] as const),
    );
    const currentBrokenLinksByKey = new Map(
      currentBrokenLinks.map((link) => [link.occurrenceKey, link] as const),
    );
    const desiredEdges = new Map<string, SemanticEdge>();
    const desiredBrokenLinks = new Map<string, BrokenLink>();

    for (const link of item.parsed.links) {
      const resolved = await this.store.resolveLinkTarget(item.ref, link.rawTarget);
      if (resolved === null) {
        const existingBrokenLink = currentBrokenLinksByKey.get(link.occurrenceKey);
        const brokenLink: BrokenLink = {
          occurrenceKey: link.occurrenceKey,
          sourceDocId: item.document.id,
          rawTarget: link.rawTarget,
          reason: BROKEN_LINK_REASON,
          createdAt: existingBrokenLink?.createdAt ?? now,
          updatedAt: now,
        };
        if (link.anchor !== undefined) {
          brokenLink.anchor = link.anchor;
        }
        if (
          existingBrokenLink !== undefined &&
          hasSameBrokenLinkContent(existingBrokenLink, brokenLink)
        ) {
          brokenLink.updatedAt = existingBrokenLink.updatedAt;
        }
        desiredBrokenLinks.set(link.occurrenceKey, brokenLink);
        continue;
      }

      const targetDoc = await this.graph.findDocumentByRef(
        this.vaultId,
        resolved.storeId,
        resolved.storeKey,
      );
      if (targetDoc === null) {
        const existingBrokenLink = currentBrokenLinksByKey.get(link.occurrenceKey);
        const brokenLink: BrokenLink = {
          occurrenceKey: link.occurrenceKey,
          sourceDocId: item.document.id,
          rawTarget: link.rawTarget,
          reason: BROKEN_LINK_REASON,
          createdAt: existingBrokenLink?.createdAt ?? now,
          updatedAt: now,
        };
        if (link.anchor !== undefined) {
          brokenLink.anchor = link.anchor;
        }
        if (
          existingBrokenLink !== undefined &&
          hasSameBrokenLinkContent(existingBrokenLink, brokenLink)
        ) {
          brokenLink.updatedAt = existingBrokenLink.updatedAt;
        }
        desiredBrokenLinks.set(link.occurrenceKey, brokenLink);
        continue;
      }

      const existingEdge = currentEdgesByKey.get(link.occurrenceKey);
      const edge: SemanticEdge = {
        occurrenceKey: link.occurrenceKey,
        sourceDocId: item.document.id,
        targetDocId: targetDoc.id,
        type: link.type,
        source: link.kind === "explicit" ? "explicit" : "llm",
        status: link.kind === "explicit" ? "active" : "pending",
        createdAt: existingEdge?.createdAt ?? now,
        updatedAt: now,
      };
      if (link.anchor !== undefined) {
        edge.anchor = link.anchor;
      }
      if (
        existingEdge !== undefined &&
        hasSameSemanticEdgeContent(existingEdge, edge)
      ) {
        edge.updatedAt = existingEdge.updatedAt;
      }
      desiredEdges.set(link.occurrenceKey, edge);
    }

    for (const edge of currentEdges) {
      if (!desiredEdges.has(edge.occurrenceKey)) {
        await this.graph.deleteSemanticEdge(edge.occurrenceKey);
        summary.edgesDeleted += 1;
      }
    }

    for (const link of currentBrokenLinks) {
      if (!desiredBrokenLinks.has(link.occurrenceKey)) {
        await this.graph.deleteBrokenLink(link.occurrenceKey);
        summary.brokenLinksDeleted += 1;
      }
    }

    for (const edge of desiredEdges.values()) {
      const current = currentEdgesByKey.get(edge.occurrenceKey);
      if (current !== undefined && semanticEdgesEqual(current, edge)) {
        continue;
      }
      await this.graph.upsertSemanticEdge(edge);
      summary.edgesUpserted += 1;
    }

    for (const link of desiredBrokenLinks.values()) {
      const current = currentBrokenLinksByKey.get(link.occurrenceKey);
      if (current !== undefined && brokenLinksEqual(current, link)) {
        continue;
      }
      await this.graph.upsertBrokenLink(link);
      summary.brokenLinksUpserted += 1;
    }
  }
}

function deriveTitle(ref: DocumentRef, parsed: ParsedDocument): string {
  const passthroughTitle = parsed.passthrough["title"];
  if (typeof passthroughTitle === "string" && passthroughTitle.trim() !== "") {
    return passthroughTitle.trim();
  }

  const headingTitle = parsed.headings[0]?.text.trim();
  if (headingTitle !== undefined && headingTitle !== "") {
    return headingTitle;
  }

  return ref.path ?? ref.storeKey;
}

function normalizeTags(tags: readonly string[] | undefined): Tag[] {
  if (tags === undefined) return [];
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    .sort()
    .map((name) => ({ name }));
}

function hasSameSemanticEdgeContent(
  current: SemanticEdge,
  next: SemanticEdge,
): boolean {
  return (
    current.occurrenceKey === next.occurrenceKey &&
    current.sourceDocId === next.sourceDocId &&
    current.targetDocId === next.targetDocId &&
    current.type === next.type &&
    current.source === next.source &&
    current.status === next.status &&
    current.confidence === next.confidence &&
    current.rationale === next.rationale &&
    current.anchor === next.anchor &&
    current.model === next.model
  );
}

function semanticEdgesEqual(current: SemanticEdge, next: SemanticEdge): boolean {
  return (
    hasSameSemanticEdgeContent(current, next) &&
    current.createdAt.getTime() === next.createdAt.getTime() &&
    current.updatedAt.getTime() === next.updatedAt.getTime()
  );
}

function brokenLinksEqual(current: BrokenLink, next: BrokenLink): boolean {
  return (
    hasSameBrokenLinkContent(current, next) &&
    current.createdAt.getTime() === next.createdAt.getTime() &&
    current.updatedAt.getTime() === next.updatedAt.getTime()
  );
}

function hasSameBrokenLinkContent(
  current: BrokenLink,
  next: BrokenLink,
): boolean {
  return (
    current.occurrenceKey === next.occurrenceKey &&
    current.sourceDocId === next.sourceDocId &&
    current.rawTarget === next.rawTarget &&
    current.anchor === next.anchor &&
    current.reason === next.reason
  );
}
