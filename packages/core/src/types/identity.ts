import { createHash } from "node:crypto";

declare const __documentId: unique symbol;
declare const __publicId: unique symbol;
declare const __occurrenceKey: unique symbol;

export type DocumentId = string & { readonly [__documentId]: never };
export type PublicId = string & { readonly [__publicId]: never };
export type OccurrenceKey = string & { readonly [__occurrenceKey]: never };

/** Creates a stable 16-hex-char DocumentId from vaultId and storeKey. */
export function createDocumentId(vaultId: string, storeKey: string): DocumentId {
  const raw = `${vaultId}:${storeKey}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16) as DocumentId;
}

/** Wraps a raw string as a PublicId (no transformation). */
export function toPublicId(raw: string): PublicId {
  return raw as PublicId;
}

/** Wraps a raw string as an OccurrenceKey (no transformation). */
export function toOccurrenceKey(raw: string): OccurrenceKey {
  return raw as OccurrenceKey;
}
