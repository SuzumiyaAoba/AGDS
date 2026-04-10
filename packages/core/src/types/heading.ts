import type { DocumentId } from "./identity.js";

export interface Heading {
  id: string;
  docId: DocumentId;
  /** Heading level (1–6). */
  level: number;
  text: string;
  /** URL-safe slug derived from text. */
  slug: string;
  /** 0-based position order within the document. */
  order: number;
}
