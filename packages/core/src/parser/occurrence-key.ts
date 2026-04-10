import { createHash } from "node:crypto";
import { toOccurrenceKey, type OccurrenceKey } from "../types/identity.js";

function sha1hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

/** Normalize a link target for key derivation (lowercase, trim). */
export function normalizeTarget(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Normalize anchor text for key derivation (collapse whitespace, lowercase). */
export function normalizeAnchorText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compute the `"ex:"` occurrenceKey for an explicit `[[...]]` link in body text.
 *
 * Stable across re-runs for unchanged content and stable under unrelated
 * edits (adding an unrelated paragraph elsewhere does not change the key).
 *
 * @param containingHeadingSlug  Slug of the heading section containing the link;
 *                               empty string for links before the first heading.
 * @param rawTarget              Raw target string from the link token.
 * @param anchorText             Raw anchor text from the link token.
 * @param anchor                 Optional `#heading-slug` portion of the target.
 * @param nthOccurrence          0-based index among identical-payload links
 *                               within the same heading section.
 */
export function makeExplicitOccurrenceKey(
  containingHeadingSlug: string,
  rawTarget: string,
  anchorText: string,
  anchor: string | undefined,
  nthOccurrence: number,
): OccurrenceKey {
  const payload = [
    containingHeadingSlug,
    normalizeTarget(rawTarget),
    normalizeAnchorText(anchorText),
    anchor ?? "",
    String(nthOccurrence),
  ].join("\0");
  return toOccurrenceKey(`ex:${sha1hex(payload)}`);
}

/**
 * Compute the `"sl:"` occurrenceKey for a suggestion inside the managed
 * `<!-- agds:suggested-links start … end -->` fence.
 *
 * Intentionally excludes mutable review-time fields (type, rationale) so
 * editing the type does not invalidate the key.
 *
 * @param rawTarget   Raw target string from the link token.
 * @param anchorText  Raw anchor text from the link token.
 * @param anchor      Optional `#heading-slug` portion of the target.
 */
export function makeManagedSuggestionOccurrenceKey(
  rawTarget: string,
  anchorText: string,
  anchor: string | undefined,
): OccurrenceKey {
  const payload = [
    normalizeTarget(rawTarget),
    normalizeAnchorText(anchorText),
    anchor ?? "",
  ].join("\0");
  return toOccurrenceKey(`sl:${sha1hex(payload)}`);
}

/**
 * Compute the `"ext:"` occurrenceKey for an edge minted programmatically
 * (not from a Markdown token).
 *
 * @param payload  Arbitrary string uniquely identifying the external edge.
 */
export function makeExternalOccurrenceKey(payload: string): OccurrenceKey {
  return toOccurrenceKey(`ext:${sha1hex(payload)}`);
}
