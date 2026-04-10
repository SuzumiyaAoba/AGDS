import type { OccurrenceKey } from "../types/identity.js";
import type { Heading } from "../types/heading.js";

/**
 * The reserved `agds:` frontmatter namespace.
 * All other fields are passed through untouched in `rawFrontmatter`.
 */
export interface AgdsFrontmatter {
  /** User-facing stable identifier (`agds.id`). Promoted to `Document.publicId`. */
  id?: string;
  /** Tags promoted to `(:Tag)` nodes. */
  tags?: string[];
  /** LLM-managed summary, written by `summarize`. */
  summary?: string;
  /** If true, exclude this document from `suggest`. */
  doNotSuggest?: boolean;
  /** If true, refuse any AGDS-side rewrite. */
  frozen?: boolean;
}

/**
 * A single AGDS link token extracted from a document.
 */
export interface ParsedLink {
  /** `"explicit"` for `[[...]]` tokens; `"suggestion"` for `[?[...]]` tokens. */
  kind: "explicit" | "suggestion";
  /** The anchor text as written inside the brackets. */
  anchorText: string;
  /**
   * Relation type name. Defaults to `"LINKS_TO"` for explicit links and
   * `"RELATED_TO"` for suggestions when not annotated.
   */
  type: string;
  /**
   * The raw target string as written in the link, including any `#anchor`
   * suffix. Must be resolved by the active `DocumentStore`.
   */
  rawTarget: string;
  /** The `#heading-slug` portion of `rawTarget`, if present. */
  anchor?: string;
  /**
   * Slug of the heading that contains this link, or `""` for links that
   * appear before the first heading.
   */
  containingHeadingSlug: string;
  /**
   * 0-based index among links within the same `containingHeadingSlug` that
   * share the same `(normalizedTarget, normalizedAnchorText, anchor?)` tuple.
   * Used for `occurrenceKey` stability when the same target is linked
   * multiple times within one section.
   */
  nthOccurrence: number;
  /**
   * Whether this link was found inside the managed
   * `<!-- agds:suggested-links start … end -->` fence.
   */
  inManagedSection: boolean;
  /** Stable per-occurrence identity, computed deterministically from context. */
  occurrenceKey: OccurrenceKey;
  /** Byte offset of the token start within the full document string. */
  offset: number;
}

/**
 * The fully parsed representation of a single Markdown document.
 */
export interface ParsedDocument {
  /** Parsed `agds:` frontmatter fields. */
  agds: AgdsFrontmatter;
  /**
   * All frontmatter fields excluding the `agds` key.
   * Preserved verbatim for round-trip writeback.
   */
  passthrough: Record<string, unknown>;
  /** Headings extracted from the document body, in order. */
  headings: Heading[];
  /** All AGDS link tokens extracted from the document, in order. */
  links: ParsedLink[];
  /**
   * The document body after stripping frontmatter.
   * Byte positions in `links` are relative to this string.
   */
  body: string;
}
