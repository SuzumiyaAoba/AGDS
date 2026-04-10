import { AgdsError } from "@agds/core";
import type { GraphStore } from "@agds/core";

export interface QueryServiceOptions {
  graph: GraphStore;
}

export interface QueryOptions {
  /**
   * Set to `true` to allow write Cypher (CREATE, MERGE, SET, DELETE, etc.).
   * Defaults to `false` (read-only mode).
   */
  write?: boolean;
}

/**
 * Thin wrapper around `GraphStore.query()` that enforces read-only mode by
 * default.  Write queries are rejected with `AgdsError(QUERY_WRITE_FORBIDDEN)`
 * unless `{ write: true }` is explicitly passed.
 *
 * Detection is heuristic (keyword scan) and is intentionally conservative: a
 * query that looks like a write is always rejected in read-only mode, even if
 * it would actually be side-effect-free.  This keeps the surface safe for LLM
 * consumption without requiring a full Cypher parser.
 */
export class QueryService {
  private readonly graph: GraphStore;

  constructor(opts: QueryServiceOptions) {
    this.graph = opts.graph;
  }

  async query<T = unknown>(cypher: string, opts: QueryOptions = {}): Promise<T[]> {
    const allowWrite = opts.write ?? false;

    if (!allowWrite && looksLikeWriteQuery(cypher)) {
      throw AgdsError.queryWriteForbidden(cypher);
    }

    return this.graph.query<T>(cypher);
  }
}

// ── Write detection ──────────────────────────────────────────────────────────

/**
 * Cypher keywords that indicate a write operation.
 *
 * Note: this is intentionally conservative — it matches keyword occurrences
 * even inside string literals or comments.  False positives are preferred over
 * false negatives in a read-only safety guard.
 */
const WRITE_KEYWORD_RE =
  /\b(CREATE|MERGE|SET|DELETE|DETACH\s+DELETE|REMOVE|DROP)\b/i;

function looksLikeWriteQuery(cypher: string): boolean {
  return WRITE_KEYWORD_RE.test(cypher);
}
