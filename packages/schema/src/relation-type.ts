import { z } from "zod";

/** Regex that valid relation type names must match (SCREAMING_SNAKE_CASE). */
export const RELATION_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export const RelationTypeSchema = z.object({
  name: z.string().regex(RELATION_TYPE_PATTERN, "invalid relation type name"),
  description: z.string(),
  canonical: z.string().regex(RELATION_TYPE_PATTERN, "invalid canonical name"),
  createdBy: z.string().min(1),
  createdAt: z.date(),
});
export type RelationType = z.infer<typeof RelationTypeSchema>;
