import type {
  Document,
  DocumentId,
  EdgeStatus,
  GraphStore,
  SemanticEdge,
} from "@agds/core";
import { ResolveService } from "./resolve-service.js";

export interface NavigationServiceOptions {
  vaultId: string;
  graph: GraphStore;
  /** Optional pre-constructed resolver. When omitted a new one is created internally. */
  resolver?: ResolveService;
}

export type EdgeStatusFilter = EdgeStatus | "any";

export interface NeighborsOptions {
  /** Filter by relationship type. Returns all types when omitted. */
  type?: string;
  /**
   * Traversal depth.  Depth 1 returns direct neighbors only.
   * Larger values perform a breadth-first search.
   * Defaults to 1.
   */
  depth?: number;
  /**
   * Filter edges by status.
   * Defaults to `"active"`.
   */
  status?: EdgeStatusFilter;
}

export interface NeighborResult {
  document: Document;
  /** The outgoing edge that connects the root to this neighbor (or the frontier node to this neighbor at depth > 1). */
  edge: SemanticEdge;
  /** BFS distance from the root document (1 = direct neighbor). */
  depth: number;
}

export interface BacklinkResult {
  document: Document;
  /** The incoming edge from `document` pointing at the root document. */
  edge: SemanticEdge;
}

/**
 * Graph navigation service.  Exposes `neighbors` (outgoing-edge BFS) and
 * `backlinks` (incoming active edges).  Strictly read-only.
 */
export class NavigationService {
  private readonly graph: GraphStore;
  private readonly resolver: ResolveService;

  constructor(opts: NavigationServiceOptions) {
    this.graph = opts.graph;
    this.resolver = opts.resolver ?? new ResolveService({ vaultId: opts.vaultId, graph: opts.graph });
  }

  /**
   * Return all documents reachable from the resolved document via outgoing
   * edges within the specified depth.
   *
   * Results are de-duplicated by document id: if the same document is
   * reachable via multiple paths, only the shortest-path occurrence is
   * retained (lowest depth, then first-encountered edge).
   */
  async neighbors(input: string, opts: NeighborsOptions = {}): Promise<NeighborResult[]> {
    const maxDepth = opts.depth ?? 1;
    const statusFilter: EdgeStatusFilter = opts.status ?? "active";

    const { document: root } = await this.resolver.resolve(input);

    const results: NeighborResult[] = [];
    const visited = new Set<DocumentId>([root.id]);

    // BFS frontier: [docId, currentDepth]
    let frontier: DocumentId[] = [root.id];

    for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
      const nextFrontier: DocumentId[] = [];

      // Fetch all edge lists for the current frontier in parallel.
      const edgesPerNode = await Promise.all(
        frontier.map((docId) => this.graph.listEdgesFrom(docId)),
      );

      // Collect unvisited target IDs while applying filters.
      const toFetch: { edge: SemanticEdge; targetId: DocumentId }[] = [];
      for (const edges of edgesPerNode) {
        for (const edge of edges) {
          if (!matchesStatus(edge, statusFilter)) continue;
          if (opts.type !== undefined && edge.type !== opts.type) continue;
          const targetId = edge.targetDocId;
          if (visited.has(targetId)) continue;
          visited.add(targetId);
          toFetch.push({ edge, targetId });
        }
      }

      // Fetch all target documents in parallel.
      const docs = await Promise.all(
        toFetch.map(({ targetId }) => this.graph.findDocumentById(targetId)),
      );
      for (let i = 0; i < toFetch.length; i++) {
        const doc = docs[i];
        const item = toFetch[i];
        if (doc === null || doc === undefined || doc.archived || item === undefined) continue;
        results.push({ document: doc, edge: item.edge, depth: d });
        nextFrontier.push(item.targetId);
      }

      frontier = nextFrontier;
    }

    return results;
  }

  /**
   * Return all documents that have an active outgoing edge pointing at the
   * resolved document.
   */
  async backlinks(input: string): Promise<BacklinkResult[]> {
    const { document: target } = await this.resolver.resolve(input);
    const edges = await this.graph.listEdgesTo(target.id);

    const activeEdges = edges.filter((e) => e.status === "active");
    const docs = await Promise.all(
      activeEdges.map((e) => this.graph.findDocumentById(e.sourceDocId)),
    );

    const results: BacklinkResult[] = [];
    for (let i = 0; i < activeEdges.length; i++) {
      const doc = docs[i];
      const edge = activeEdges[i];
      if (doc === null || doc === undefined || doc.archived || edge === undefined) continue;
      results.push({ document: doc, edge });
    }

    return results;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchesStatus(edge: SemanticEdge, filter: EdgeStatusFilter): boolean {
  if (filter === "any") return true;
  return edge.status === filter;
}
