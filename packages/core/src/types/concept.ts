export interface Concept {
  /** Unique concept name within the vault. */
  name: string;
  /** Optional embedding vector (gated on embeddings config). */
  embedding?: readonly number[];
}
