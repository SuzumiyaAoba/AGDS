import {
  AgdsError,
  toDocumentId,
  toPublicId,
} from "@agds/core";
import type {
  Document,
  DocumentId,
  GraphStore,
  Heading,
  SemanticEdge,
} from "@agds/core";

export interface ResolveServiceOptions {
  vaultId: string;
  graph: GraphStore;
}

export interface ResolveEdgeSummary {
  active: number;
  pending: number;
  total: number;
}

export interface ResolveResult {
  document: Document;
  /** Resolved heading when the input contained a `#anchor`. */
  heading?: Heading;
  /** Outgoing edge counts. */
  edges: ResolveEdgeSummary;
  /** Which normalization step produced the match. */
  matchedBy: string;
  /** True when the match was produced by fuzzy edit-distance comparison. */
  fuzzy: boolean;
}

/** Regex that matches both AGDS explicit and suggestion link syntax. */
const AGDS_LINK_RE = /^\[?\??\[[^\]]*\]\(([^)]+)\)\]?$/;

/**
 * Strip the outer AGDS link syntax `[[text](target)]` or `[?[text](target)]`,
 * returning the raw target string.  If the input is not AGDS link syntax, the
 * trimmed input is returned unchanged.
 */
function parseRawInput(input: string): string {
  const m = AGDS_LINK_RE.exec(input.trim());
  return m ? (m[1] ?? input.trim()) : input.trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function fuzzyMatch(documents: Document[], target: string): Document | undefined {
  const lower = target.toLowerCase();
  const threshold = Math.max(1, Math.floor(lower.length / 4));
  let best: Document | undefined;
  let bestDist = Infinity;

  for (const doc of documents) {
    const dist = levenshtein(doc.title.toLowerCase(), lower);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = doc;
    }
  }
  return best;
}

function summarizeEdges(edges: SemanticEdge[]): ResolveEdgeSummary {
  let active = 0;
  let pending = 0;
  for (const e of edges) {
    if (e.status === "active") active++;
    else if (e.status === "pending") pending++;
  }
  return { active, pending, total: edges.length };
}

/**
 * Resolves user-facing references to AGDS documents without mutating graph state.
 *
 * Accepted input forms:
 * - AGDS link token: `[[text](target)]` or `[?[text](target)]`
 * - `Document.publicId`
 * - `Document.id` (16-char hex)
 * - `storeKey` (exact)
 * - `path` (exact)
 * - `Document.title` (exact, then fuzzy)
 * - Any of the above with a `#heading-slug` anchor suffix
 *
 * On miss, throws `AgdsError(RESOLVE_NOT_FOUND)` with the normalization trail.
 * This service is strictly read-only — it never mutates the graph.
 */
export class ResolveService {
  private readonly vaultId: string;
  private readonly graph: GraphStore;

  constructor(opts: ResolveServiceOptions) {
    this.vaultId = opts.vaultId;
    this.graph = opts.graph;
  }

  async resolve(input: string): Promise<ResolveResult> {
    const trail: string[] = [];
    const raw = parseRawInput(input);

    // Split off the anchor fragment (everything after the first `#`).
    const hashIdx = raw.indexOf("#");
    const docPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    const anchorSlug = hashIdx >= 0 ? raw.slice(hashIdx + 1) : undefined;

    // ── Step 1: publicId exact ─────────────────────────────────────────────
    trail.push("publicId");
    if (docPart) {
      const doc = await this.graph.findDocumentByPublicId(
        this.vaultId,
        toPublicId(docPart),
      );
      if (doc !== null) {
        return this.buildResult(doc, anchorSlug, "publicId", false);
      }
    }

    // ── Step 2: Document.id exact ──────────────────────────────────────────
    trail.push("document.id");
    if (docPart && /^[0-9a-f]{16}$/i.test(docPart)) {
      const doc = await this.graph.findDocumentById(toDocumentId(docPart));
      if (doc !== null && doc.vaultId === this.vaultId) {
        return this.buildResult(doc, anchorSlug, "document.id", false);
      }
    }

    // Load all non-archived documents once for the remaining steps.
    const documents = await this.graph.listDocuments(this.vaultId);

    // ── Step 3: storeKey exact ─────────────────────────────────────────────
    trail.push("storeKey");
    if (docPart) {
      const doc = documents.find((d) => d.storeKey === docPart);
      if (doc !== undefined) {
        return this.buildResult(doc, anchorSlug, "storeKey", false);
      }
    }

    // ── Step 4: path exact ─────────────────────────────────────────────────
    trail.push("path");
    if (docPart) {
      const doc = documents.find((d) => d.path === docPart);
      if (doc !== undefined) {
        return this.buildResult(doc, anchorSlug, "path", false);
      }
    }

    // ── Step 5: title exact ────────────────────────────────────────────────
    trail.push("title");
    if (docPart) {
      const doc = documents.find((d) => d.title === docPart);
      if (doc !== undefined) {
        return this.buildResult(doc, anchorSlug, "title", false);
      }
    }

    // ── Step 6: fuzzy title match ──────────────────────────────────────────
    trail.push("fuzzy");
    if (docPart) {
      const doc = fuzzyMatch(documents, docPart);
      if (doc !== undefined) {
        return this.buildResult(doc, anchorSlug, "fuzzy", true);
      }
    }

    throw AgdsError.resolveNotFound(input, trail);
  }

  private async buildResult(
    doc: Document,
    anchorSlug: string | undefined,
    matchedBy: string,
    fuzzy: boolean,
  ): Promise<ResolveResult> {
    const [edges, heading] = await Promise.all([
      this.graph.listEdgesFrom(doc.id),
      anchorSlug !== undefined
        ? this.resolveHeading(doc.id, anchorSlug)
        : Promise.resolve(undefined),
    ]);

    return {
      document: doc,
      heading,
      edges: summarizeEdges(edges),
      matchedBy,
      fuzzy,
    };
  }

  private async resolveHeading(
    docId: DocumentId,
    slug: string,
  ): Promise<Heading | undefined> {
    const headings = await this.graph.listHeadingsForDocument(docId);
    return headings.find((h) => h.slug === slug);
  }
}
