import type { DocumentId, OccurrenceKey } from "./identity.js";

export type EdgeSource = "explicit" | "llm" | "user";
export type EdgeStatus = "active" | "pending" | "rejected";

/** Regex that valid relation type names must match. */
export const RELATION_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export interface RelationType {
  /** Unique name in SCREAMING_SNAKE_CASE format. */
  name: string;
  description: string;
  /** Canonical form used for normalization. */
  canonical: string;
  createdBy: string;
  createdAt: Date;
}

/** Property envelope shared by all semantic edges. */
export interface SemanticEdge {
  /** Stable per-occurrence id; part of edge identity. */
  occurrenceKey: OccurrenceKey;
  sourceDocId: DocumentId;
  targetDocId: DocumentId;
  /** Open-ended relation type name (validated against RELATION_TYPE_PATTERN). */
  type: string;
  source: EdgeSource;
  status: EdgeStatus;
  /** Confidence score in [0, 1]; present on LLM edges. */
  confidence?: number;
  /** LLM rationale for suggesting this edge. */
  rationale?: string;
  /** Optional #heading anchor on the target document. */
  anchor?: string;
  createdAt: Date;
  updatedAt: Date;
  /** LLM model id; present on LLM edges. */
  model?: string;
}
