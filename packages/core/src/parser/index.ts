import type { DocumentId } from "../types/identity.js";
import { extractFrontmatter } from "./frontmatter.js";
import { extractHeadings } from "./headings.js";
import { type ExtractLinksOptions, extractLinks, findHeadingOffsets } from "./links.js";
import type { ParsedDocument } from "./types.js";

export type { ParsedDocument, ParsedLink, AgdsFrontmatter } from "./types.js";
export { slugify } from "./headings.js";
export {
  makeExplicitOccurrenceKey,
  makeManagedSuggestionOccurrenceKey,
  makeExternalOccurrenceKey,
  normalizeTarget,
  normalizeAnchorText,
} from "./occurrence-key.js";
export type { ExtractLinksOptions } from "./links.js";
export { findHeadingOffsets } from "./links.js";
export { extractFrontmatter } from "./frontmatter.js";
export type { FrontmatterResult } from "./frontmatter.js";

export interface ParseOptions {
  /**
   * The `DocumentId` of the document being parsed.
   * Required to populate `Heading.id` and `Heading.docId`.
   */
  docId: DocumentId;
  /** Override the default relation type for explicit links (default: `"LINKS_TO"`). */
  defaultExplicitType?: string;
  /** Override the default relation type for suggestions (default: `"RELATED_TO"`). */
  defaultSuggestionType?: string;
}

/**
 * Parse a raw Markdown document string into a structured `ParsedDocument`.
 *
 * This function is pure: it performs no I/O and does not resolve link targets.
 * Link targets are left as raw strings for the active `DocumentStore` to resolve.
 *
 * @param raw   The full raw Markdown string (including frontmatter if present).
 * @param opts  Parse options including the document's `DocumentId`.
 */
export function parseDocument(raw: string, opts: ParseOptions): ParsedDocument {
  const { agds, passthrough, body } = extractFrontmatter(raw);
  const headings = extractHeadings(body, opts.docId);
  const headingOffsets = findHeadingOffsets(body, headings);
  const linkOpts: ExtractLinksOptions = {};
  if (opts.defaultExplicitType !== undefined) {
    linkOpts.defaultExplicitType = opts.defaultExplicitType;
  }
  if (opts.defaultSuggestionType !== undefined) {
    linkOpts.defaultSuggestionType = opts.defaultSuggestionType;
  }
  const links = extractLinks(body, headingOffsets, linkOpts);

  return { agds, passthrough, headings, links, body };
}
