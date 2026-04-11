import { z } from "zod";

export const BrokenLinkSchema = z.object({
  occurrenceKey: z.string().min(1),
  sourceDocId: z.string().length(16),
  rawTarget: z.string(),
  anchor: z.string().optional(),
  reason: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
