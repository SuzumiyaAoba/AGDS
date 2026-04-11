import {
  extractFrontmatter,
  findHeadingOffsets,
  parseDocument,
} from "@agds/core";
import type {
  Document,
  DocumentRef,
  DocumentStore,
  GraphStore,
  Heading,
} from "@agds/core";
import { ResolveService } from "./resolve-service.js";

export interface FetchServiceOptions {
  vaultId: string;
  graph: GraphStore;
  store: DocumentStore;
  /** Optional pre-constructed resolver. When omitted a new one is created internally. */
  resolver?: ResolveService;
}

export type FetchFormat = "md" | "text" | "json";

export interface FetchOptions {
  /** Heading slug to slice the body to. Returns the section and all sub-sections. */
  section?: string;
  /** Output format. Defaults to `"md"`. */
  format?: FetchFormat;
}

export interface FetchResult {
  document: Document;
  /** Resolved heading when `section` was specified and found. */
  heading?: Heading;
  /** Document (or section) body in the requested format. */
  body: string;
  format: FetchFormat;
}

/**
 * Fetches document body from the document store, with optional section slicing
 * and format conversion.  Strictly read-only — this service never writes to the
 * graph or the document store.
 */
export class FetchService {
  private readonly store: DocumentStore;
  private readonly resolver: ResolveService;

  constructor(opts: FetchServiceOptions) {
    this.store = opts.store;
    this.resolver = opts.resolver ?? new ResolveService({ vaultId: opts.vaultId, graph: opts.graph });
  }

  async fetch(input: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const format: FetchFormat = opts.format ?? "md";

    // Resolve the document reference via the normalization ladder.
    const resolved = await this.resolver.resolve(input);
    const { document } = resolved;

    // Read the raw body from the document store.
    const ref: DocumentRef = { storeId: document.storeId, storeKey: document.storeKey };
    if (document.path !== undefined) ref.path = document.path;
    const blob = await this.store.read(ref);

    let body: string;
    let heading: Heading | undefined;

    // Slice to the requested section if provided.
    if (opts.section !== undefined) {
      // parseDocument already strips frontmatter; reuse its output to avoid parsing twice.
      const parsed = parseDocument(blob.body, { docId: document.id });
      body = parsed.body;
      const offsets = findHeadingOffsets(parsed.body, parsed.headings);
      const slice = sliceSection(parsed.body, offsets, opts.section);
      if (slice !== null) {
        body = slice.body;
        heading = slice.heading;
      }
      // When the slug is not found, fall through to the full body.
    } else {
      ({ body } = extractFrontmatter(blob.body));
    }

    const formattedBody = applyFormat(body, format);
    const result: FetchResult = { document, body: formattedBody, format };
    if (heading !== undefined) result.heading = heading;
    return result;
  }
}

// ── Section slicing ──────────────────────────────────────────────────────────

interface SectionSlice {
  heading: Heading;
  body: string;
}

function sliceSection(
  body: string,
  offsets: { heading: Heading; offset: number }[],
  slug: string,
): SectionSlice | null {
  const idx = offsets.findIndex(({ heading }) => heading.slug === slug);
  if (idx === -1) return null;

  const entry = offsets[idx];
  if (entry === undefined) return null;
  const { offset: start, heading } = entry;

  // End at the next heading of equal or higher level, or EOF.
  let end = body.length;
  for (let i = idx + 1; i < offsets.length; i++) {
    const next = offsets[i];
    if (next === undefined) break;
    if (next.heading.level <= heading.level) {
      end = next.offset;
      break;
    }
  }

  return { heading, body: body.slice(start, end).trimEnd() };
}

// ── Format conversion ────────────────────────────────────────────────────────

/** Regex patterns for stripping common markdown syntax to plain text. */
const HEADING_PREFIX_RE = /^#{1,6}\s+/gm;
const AGDS_LINK_RE = /\[?\??\[([^\]|]*?)(?:\|[A-Z][A-Z0-9_]*)?\]\([^)]*\)\]?/g;
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const BOLD_ITALIC_RE = /[*_]{1,3}([^*_\n]+)[*_]{1,3}/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const BLOCKQUOTE_RE = /^>\s?/gm;

function toPlainText(md: string): string {
  return md
    .replace(CODE_FENCE_RE, "")
    .replace(HEADING_PREFIX_RE, "")
    .replace(AGDS_LINK_RE, "$1")
    .replace(MD_LINK_RE, "$1")
    .replace(BOLD_ITALIC_RE, "$1")
    .replace(INLINE_CODE_RE, "$1")
    .replace(BLOCKQUOTE_RE, "")
    .trim();
}

function applyFormat(body: string, format: FetchFormat): string {
  switch (format) {
    case "md":
      return body;
    case "text":
      return toPlainText(body);
    case "json":
      return JSON.stringify({ body });
  }
}
