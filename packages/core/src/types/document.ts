import type { DocumentId, PublicId } from "./identity.js";

export interface DocumentRef {
  /** Identifies the DocumentStore adapter. */
  storeId: string;
  /** Opaque key used by the store to address this document. */
  storeKey: string;
  /** Optional human-readable path hint (FS adapter: relative path). Never used as identity. */
  path?: string;
}

export interface DocumentStat {
  /** SHA-256 of the normalized body (frontmatter stripped). */
  hash: string;
  /** Content length in bytes. */
  bytes: number;
  /** Store-supplied version token (mtime / etag / row version / commit SHA). */
  storeVersion: string;
}

export interface DocumentBlob {
  ref: DocumentRef;
  body: string;
  stat: DocumentStat;
}

export interface Document {
  /** Stable internal identifier: sha1(vaultId + ":" + storeKey) truncated to 16 hex chars. */
  id: DocumentId;
  /** Optional user-facing identifier from `agds.id` frontmatter; unique within a vault. */
  publicId?: PublicId;
  /** Identifies the logical vault. */
  vaultId: string;
  /** Identifies the DocumentStore adapter. */
  storeId: string;
  /** Opaque key the store uses to address the document. */
  storeKey: string;
  /** Optional presentation hint (FS, Git). Never used as identity. */
  path?: string;
  title: string;
  /** SHA-256 of the normalized body (frontmatter stripped). */
  hash: string;
  bytes: number;
  /** Store-supplied version token. */
  storeVersion: string;
  updatedAt: Date;
  /** Optional LLM-generated summary. */
  summary?: string;
  /** Set to true instead of deleting when a document disappears. */
  archived: boolean;
  schemaVersion: number;
}

export type DocumentChangeKind = "created" | "updated" | "deleted" | "renamed";

export interface DocumentChange {
  ref: DocumentRef;
  kind: DocumentChangeKind;
  /** Previous ref, populated when kind is "renamed". */
  previousRef?: DocumentRef;
}
