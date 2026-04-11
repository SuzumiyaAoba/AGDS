import { z } from "zod";
import { RELATION_TYPE_PATTERN } from "../types/edge.js";

export const RelationTypeSchema = z.object({
  name: z.string().regex(RELATION_TYPE_PATTERN, "invalid relation type name"),
  description: z.string(),
  canonical: z.string().regex(RELATION_TYPE_PATTERN, "invalid canonical name"),
  createdBy: z.string().min(1),
  createdAt: z.date(),
});
