import { z } from "zod";

export const DocumentRefSchema = z.object({
  storeId: z.string().min(1),
  storeKey: z.string().min(1),
  path: z.string().optional(),
});
export type DocumentRef = z.infer<typeof DocumentRefSchema>;

export const DocumentStatSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/, "expected SHA-256 hex string"),
  bytes: z.number().int().nonnegative(),
  storeVersion: z.string().min(1),
});
export type DocumentStat = z.infer<typeof DocumentStatSchema>;

export const DocumentBlobSchema = z.object({
  ref: DocumentRefSchema,
  body: z.string(),
  stat: DocumentStatSchema,
});
export type DocumentBlob = z.infer<typeof DocumentBlobSchema>;

export const DocumentSchema = z.object({
  id: z.string().length(16),
  publicId: z.string().optional(),
  vaultId: z.string().min(1),
  storeId: z.string().min(1),
  storeKey: z.string().min(1),
  path: z.string().optional(),
  title: z.string(),
  hash: z.string().regex(/^[0-9a-f]{64}$/, "expected SHA-256 hex string"),
  bytes: z.number().int().nonnegative(),
  storeVersion: z.string().min(1),
  updatedAt: z.date(),
  summary: z.string().optional(),
  archived: z.boolean(),
  schemaVersion: z.number().int().nonnegative(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const HeadingSchema = z.object({
  id: z.string().min(1),
  docId: z.string().length(16),
  level: z.number().int().min(1).max(6),
  text: z.string(),
  slug: z.string().min(1),
  order: z.number().int().nonnegative(),
});
export type Heading = z.infer<typeof HeadingSchema>;
