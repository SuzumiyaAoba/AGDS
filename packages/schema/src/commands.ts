import { z } from "zod";
import { DocumentSchema } from "./document.js";
import { HeadingSchema } from "./document.js";

// ── Sync ──────────────────────────────────────────────────────────────────────

export const SyncOptionsSchema = z.object({
  vaultId: z.string().min(1),
  /** When true, compute and report changes without writing to the graph. */
  dryRun: z.boolean().default(false),
  /**
   * When true, skip the `storeVersion` probe and always re-read every
   * document body.
   */
  force: z.boolean().default(false),
});
export type SyncOptions = z.infer<typeof SyncOptionsSchema>;

export const SyncErrorSchema = z.object({
  storeKey: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type SyncError = z.infer<typeof SyncErrorSchema>;

export const SyncResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  errors: z.array(SyncErrorSchema),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

// ── Verify ────────────────────────────────────────────────────────────────────

export const VerifyOptionsSchema = z.object({
  vaultId: z.string().min(1),
});
export type VerifyOptions = z.infer<typeof VerifyOptionsSchema>;

export const VerifyIssueKindSchema = z.enum([
  "broken_link",
  "orphaned_heading",
  "orphaned_tag",
  "public_id_conflict",
]);
export type VerifyIssueKind = z.infer<typeof VerifyIssueKindSchema>;

export const VerifyIssueSchema = z.object({
  kind: VerifyIssueKindSchema,
  /** Human-readable description of the issue. */
  message: z.string(),
  /** The document that contains or owns the issue, when applicable. */
  docId: z.string().optional(),
  /** Additional context (e.g. the unresolved target string for broken links). */
  context: z.record(z.string(), z.unknown()).optional(),
});
export type VerifyIssue = z.infer<typeof VerifyIssueSchema>;

export const VerifyResultSchema = z.object({
  issues: z.array(VerifyIssueSchema),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

// ── Resolve ───────────────────────────────────────────────────────────────────

export const ResolveOptionsSchema = z.object({
  vaultId: z.string().min(1),
  /**
   * The reference string to resolve. May be one of:
   * - an internal Document.id (16-char hex)
   * - a user-facing publicId
   * - a storeKey
   * - a path hint
   * The service tries each form in this order (normalization ladder).
   */
  ref: z.string().min(1),
  /** Optional heading anchor to resolve within the document. */
  anchor: z.string().optional(),
});
export type ResolveOptions = z.infer<typeof ResolveOptionsSchema>;

export const ResolveResultSchema = z.object({
  document: DocumentSchema,
  /** Resolved heading when an anchor was requested and found. */
  heading: HeadingSchema.optional(),
});
export type ResolveResult = z.infer<typeof ResolveResultSchema>;

// ── Fetch ─────────────────────────────────────────────────────────────────────

export const FetchOptionsSchema = z.object({
  vaultId: z.string().min(1),
  /** Reference to the document to fetch (same forms as ResolveOptions.ref). */
  ref: z.string().min(1),
  /**
   * When provided, return only the content of the section that begins with
   * the heading whose slug matches this value.
   */
  section: z.string().optional(),
});
export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

export const FetchResultSchema = z.object({
  document: DocumentSchema,
  /** Raw Markdown content (whole document or sliced section). */
  content: z.string(),
});
export type FetchResult = z.infer<typeof FetchResultSchema>;

// ── Query ─────────────────────────────────────────────────────────────────────

export const QueryOptionsSchema = z.object({
  vaultId: z.string().min(1),
  cypher: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  /** When false (default), write statements are rejected. */
  allowWrites: z.boolean().default(false),
});
export type QueryOptions = z.infer<typeof QueryOptionsSchema>;

export const QueryResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;
