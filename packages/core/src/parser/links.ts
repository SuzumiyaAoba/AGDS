import type { Heading } from "../types/heading.js";
import { z } from "zod";
import type { ParsedLink } from "./types.js";
import {
  makeExplicitOccurrenceKey,
  makeManagedSuggestionOccurrenceKey,
} from "./occurrence-key.js";

/** Default relation type for explicit links with no type annotation. */
const DEFAULT_EXPLICIT_TYPE = "LINKS_TO";
/** Default relation type for suggestions with no type annotation. */
const DEFAULT_SUGGESTION_TYPE = "RELATED_TO";

/** Regex matching the managed-section start/end fence markers. */
const MANAGED_START_RE = /<!--\s*agds:suggested-links\s+start\s*-->/;
const MANAGED_END_RE = /<!--\s*agds:suggested-links\s+end\s*-->/;

/**
 * Regex for AGDS link tokens. Named groups:
 * - `kind`: `""` for explicit, `"?"` for suggestion
 * - `anchor`: anchor text
 * - `type`: optional type annotation after `|`
 * - `target`: raw target string (may include `#anchor`)
 */
const LINK_TOKEN_RE =
  /\[(?<kind>\??)\[(?<anchor>[^\]|]*?)(?:\|(?<type>[A-Z][A-Z0-9_]{0,63}))?\]\((?<target>[^)]*)\)\]/g;
const LinkTokenGroupsSchema = z.object({
  kind: z.string(),
  anchor: z.string().optional(),
  type: z.string().optional(),
  target: z.string().optional(),
});

/**
 * Determine the slug of the heading section that contains a byte offset.
 * Returns `""` if the offset precedes the first heading.
 */
function containingSlug(offset: number, headings: readonly Heading[]): string {
  let slug = "";
  for (const h of headings) {
    // Approximate: find the heading whose regex match would precede this offset.
    // The headings array is ordered by occurrence, and extractHeadings uses a
    // forward regex scan, so we can use the `order` index as a proxy.
    // We rely on `Heading.id` containing the docId prefix; the slug is the part after the colon.
    const headingSlug = h.id.slice(h.docId.length + 1); // strip "docId:" prefix
    if (headingSlug === h.slug) {
      // Approximate position: headings[i] precedes headings[i+1]
      slug = h.slug;
    }
    // We'll refine this with actual offsets below.
    void headingSlug;
  }
  return slug; // fallback — refined in the caller with positional data
}

export interface ExtractLinksOptions {
  defaultExplicitType?: string;
  defaultSuggestionType?: string;
}

/**
 * Extract all AGDS link tokens from a document body.
 *
 * @param body      Document body (frontmatter already stripped).
 * @param headings  Headings extracted from the same body, with their byte offsets.
 */
export function extractLinks(
  body: string,
  headingOffsets: { heading: Heading; offset: number }[],
  opts: ExtractLinksOptions = {},
): ParsedLink[] {
  const defaultExplicit = opts.defaultExplicitType ?? DEFAULT_EXPLICIT_TYPE;
  const defaultSuggestion = opts.defaultSuggestionType ?? DEFAULT_SUGGESTION_TYPE;

  // Locate the managed section boundaries.
  const managedStart = MANAGED_START_RE.exec(body);
  const managedEnd = MANAGED_END_RE.exec(body);
  const managedStartOffset =
    managedStart !== null ? managedStart.index + managedStart[0].length : -1;
  const managedEndOffset = managedEnd !== null ? managedEnd.index : -1;

  function isInManagedSection(offset: number): boolean {
    if (managedStartOffset < 0 || managedEndOffset < 0) return false;
    return offset >= managedStartOffset && offset <= managedEndOffset;
  }

  /**
   * Find the slug of the heading whose section contains the given offset.
   * A section starts at the heading and runs until the next heading of the
   * same or higher level, or the end of the document.
   */
  function getContainingSlug(offset: number): string {
    let current = "";
    for (const { heading, offset: hOff } of headingOffsets) {
      if (hOff <= offset) {
        current = heading.slug;
      } else {
        break;
      }
    }
    return current;
  }

  // Track occurrence counts per (headingSlug, normalizedTarget, normalizedAnchorText, anchor).
  const occurrenceCounts = new Map<string, number>();

  const links: ParsedLink[] = [];

  LINK_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_TOKEN_RE.exec(body)) !== null) {
    const {
      kind,
      anchor: anchorText = "",
      type: rawType,
      target: rawTarget = "",
    } = LinkTokenGroupsSchema.parse(match.groups ?? {});

    const isSuggestion = kind === "?";
    const offset = match.index;
    const inManagedSection = isInManagedSection(offset);

    // Split rawTarget into target path and optional anchor fragment.
    const hashIdx = rawTarget.lastIndexOf("#");
    const targetPath = hashIdx >= 0 ? rawTarget.slice(0, hashIdx) : rawTarget;
    const anchor = hashIdx >= 0 ? rawTarget.slice(hashIdx + 1) : undefined;

    const containingHeadingSlug = getContainingSlug(offset);
    const type = rawType ?? (isSuggestion ? defaultSuggestion : defaultExplicit);

    let occurrenceKey;

    if (isSuggestion && inManagedSection) {
      occurrenceKey = makeManagedSuggestionOccurrenceKey(targetPath, anchorText, anchor);
    } else {
      // For explicit links and inline suggestions, use the "ex:" scheme.
      const dedupeKey = [containingHeadingSlug, targetPath.trim().toLowerCase(), anchorText.trim().toLowerCase(), anchor ?? ""].join("\0");
      const nth = occurrenceCounts.get(dedupeKey) ?? 0;
      occurrenceCounts.set(dedupeKey, nth + 1);

      occurrenceKey = makeExplicitOccurrenceKey(
        containingHeadingSlug,
        targetPath,
        anchorText,
        anchor,
        nth,
      );
    }

    const dedupeKey = [containingHeadingSlug, targetPath.trim().toLowerCase(), anchorText.trim().toLowerCase(), anchor ?? ""].join("\0");
    const nthOccurrence = isSuggestion && inManagedSection
      ? 0
      : (occurrenceCounts.get(dedupeKey) ?? 1) - 1;

    const link: import("./types.js").ParsedLink = {
      kind: isSuggestion ? "suggestion" : "explicit",
      anchorText,
      type,
      rawTarget,
      containingHeadingSlug,
      nthOccurrence,
      inManagedSection,
      occurrenceKey,
      offset,
    };
    if (anchor !== undefined) link.anchor = anchor;
    links.push(link);
  }

  return links;
}

/**
 * Find the byte offsets of all headings within the document body.
 *
 * @param body      Document body (frontmatter already stripped).
 * @param headings  Headings in order (from `extractHeadings`).
 */
export function findHeadingOffsets(
  body: string,
  headings: readonly Heading[],
): { heading: Heading; offset: number }[] {
  const result: { heading: Heading; offset: number }[] = [];
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;

  let i = 0;
  let match: RegExpExecArray | null;

  headingPattern.lastIndex = 0;
  while ((match = headingPattern.exec(body)) !== null && i < headings.length) {
    const h = headings[i];
    if (h !== undefined) {
      result.push({ heading: h, offset: match.index });
      i++;
    }
  }

  return result;
}
