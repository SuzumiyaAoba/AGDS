import type { DocumentId, OccurrenceKey } from "./identity.js";

export interface BrokenLink {
  /** Stable per-occurrence id; part of broken-link identity. */
  occurrenceKey: OccurrenceKey;
  sourceDocId: DocumentId;
  /** Raw unresolved target string as written in the source document. */
  rawTarget: string;
  /** Optional #heading anchor on the unresolved target. */
  anchor?: string;
  /** Machine-readable reason for the unresolved target. */
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}
