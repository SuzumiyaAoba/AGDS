import { z } from "zod";
import { RELATION_TYPE_PATTERN } from "./relation-type.js";

export const EdgeSourceSchema = z.enum(["explicit", "llm", "user"]);
export type EdgeSource = z.infer<typeof EdgeSourceSchema>;

export const EdgeStatusSchema = z.enum(["active", "pending", "rejected"]);
export type EdgeStatus = z.infer<typeof EdgeStatusSchema>;

export const SemanticEdgeSchema = z.object({
  occurrenceKey: z.string().min(1),
  sourceDocId: z.string().length(16),
  targetDocId: z.string().length(16),
  type: z.string().regex(RELATION_TYPE_PATTERN, "invalid relation type name"),
  source: EdgeSourceSchema,
  status: EdgeStatusSchema,
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
  anchor: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  model: z.string().optional(),
});
export type SemanticEdge = z.infer<typeof SemanticEdgeSchema>;
