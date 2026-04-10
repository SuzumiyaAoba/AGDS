import type { Heading } from "../types/heading.js";
import type { DocumentId } from "../types/identity.js";

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

/**
 * Convert heading text to a URL-safe slug.
 *
 * Algorithm mirrors GitHub Flavored Markdown:
 * 1. Lowercase.
 * 2. Remove characters that are not alphanumeric, space, or hyphen.
 * 3. Replace spaces with hyphens.
 * 4. Collapse consecutive hyphens.
 * 5. Strip leading and trailing hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract all headings from a document body (frontmatter already stripped).
 *
 * Each heading receives a stable `id` derived from its slug and 0-based order
 * to disambiguate duplicate slugs.
 *
 * @param body      Document body with frontmatter removed.
 * @param docId     The owning document's `DocumentId`, used in `Heading.id`.
 */
export function extractHeadings(body: string, docId: DocumentId): Heading[] {
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();

  let match: RegExpExecArray | null;
  let order = 0;

  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(body)) !== null) {
    const level = (match[1] ?? "").length as 1 | 2 | 3 | 4 | 5 | 6;
    const text = (match[2] ?? "").trim();
    const rawSlug = slugify(text);

    // Make slug unique within the document (GitHub convention: append -1, -2, …).
    const count = slugCounts.get(rawSlug) ?? 0;
    slugCounts.set(rawSlug, count + 1);
    const slug = count === 0 ? rawSlug : `${rawSlug}-${count}`;

    headings.push({
      id: `${docId}:${slug}`,
      docId,
      level,
      text,
      slug,
      order: order++,
    });
  }

  return headings;
}
