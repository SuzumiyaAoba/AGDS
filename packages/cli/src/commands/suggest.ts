import { defineCommand } from "citty";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";
import { makeExternalOccurrenceKey } from "@agds/core";
import type { SemanticEdge } from "@agds/core";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { VALID_OUTPUT_FORMATS, writeLine, type OutputFormat } from "../output.js";

const DEFAULT_URL = "http://localhost:1234/v1";
const DEFAULT_THRESHOLD = 0.5;

/**
 * Schema for the structured output from the LLM.
 * Each suggestion names a candidate document and proposes a typed edge.
 */
const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      targetPublicId: z
        .string()
        .describe("publicId of the target document as listed in the candidates"),
      type: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
        .describe(
          "Relationship type in SCREAMING_SNAKE_CASE — e.g. REFERENCES, RELATED_TO, IMPLEMENTS, PART_OF, DESCRIBES",
        ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence score between 0.0 and 1.0"),
      rationale: z
        .string()
        .describe("One-sentence explanation of why this link is appropriate"),
    }),
  ),
});

export default defineCommand({
  meta: {
    name: "suggest",
    description: "Suggest pending links between documents using an LLM via LM Studio",
  },
  args: {
    ref: {
      type: "positional",
      required: false,
      description:
        "Source document reference — publicId, storeKey, title, or AGDS link token. Omit to process all documents.",
    },
    model: {
      type: "string",
      description: "LM Studio model ID (required)",
    },
    url: {
      type: "string",
      description: `LM Studio base URL (default: ${DEFAULT_URL})`,
    },
    threshold: {
      type: "string",
      description: `Minimum confidence to save a suggestion, 0–1 (default: ${DEFAULT_THRESHOLD})`,
    },
    "dry-run": {
      type: "boolean",
      description: "Print suggestions without writing them to the graph",
      default: false,
    },
    format: {
      type: "string",
      description: "Output format: json (default), toon",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
    // ── Validate CLI args ──────────────────────────────────────────────────
    if (!args.model) {
      usageError("--model is required. Pass the LM Studio model ID.");
    }

    const rawFormat = args.format ?? "json";
    if (!VALID_OUTPUT_FORMATS.includes(rawFormat as OutputFormat)) {
      usageError(
        `Invalid format "${rawFormat}". Valid formats: ${VALID_OUTPUT_FORMATS.join(", ")}`,
      );
    }
    const format = rawFormat as OutputFormat;

    const threshold =
      args.threshold !== undefined
        ? parseFloat(args.threshold)
        : DEFAULT_THRESHOLD;
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      usageError(
        `Invalid threshold "${args.threshold}". Must be a number between 0 and 1.`,
      );
    }

    const baseURL = args.url ?? DEFAULT_URL;
    const modelId = args.model;
    const dryRun = args["dry-run"] ?? false;

    // ── LM Studio client ───────────────────────────────────────────────────
    // createOpenAICompatible targets OpenAI-compatible local servers such as
    // LM Studio. It avoids OpenAI-specific features that local models may
    // not support (e.g. strict structured-output tool calling).
    const lmstudio = createOpenAICompatible({
      name: "lmstudio",
      baseURL,
      apiKey: "lm-studio",
    });

    await withAgds(args.config, async (agds, config) => {
      const allDocs = await agds.graph.listDocuments(config.vaultId);
      const activeDocs = allDocs.filter((d) => !d.archived);

      // Determine source documents to process.
      let sourceDocs = activeDocs;
      if (args.ref !== undefined) {
        const { document } = await agds.resolve.resolve(args.ref);
        sourceDocs = [document];
      }

      type SuggestionRow = {
        targetPublicId: string | null;
        targetTitle: string;
        type: string;
        confidence: number;
        rationale: string;
      };

      type SourceResult = {
        source: string;
        saved: number;
        suggestions: SuggestionRow[];
      };

      const results: SourceResult[] = [];

      for (const sourceDoc of sourceDocs) {
        const candidates = activeDocs.filter((d) => d.id !== sourceDoc.id);
        if (candidates.length === 0) continue;

        // Fetch source body as plain text for the LLM.
        const sourceRef = sourceDoc.publicId ?? sourceDoc.storeKey;
        const { body: sourceBody } = await agds.fetch.fetch(sourceRef, {
          format: "text",
        });

        // Build a compact candidate list: publicId + title.
        const candidateLines = candidates
          .map(
            (d) =>
              `- publicId: ${d.publicId ?? d.storeKey}  title: ${d.title}`,
          )
          .join("\n");

        // ── LLM call ────────────────────────────────────────────────────
        const { object } = await generateObject({
          model: lmstudio(modelId),
          schema: SuggestionSchema,
          prompt: `You are building a knowledge graph of Markdown documents.
Suggest meaningful directed links FROM the source document TO relevant candidates.

SOURCE DOCUMENT
publicId: ${sourceDoc.publicId ?? "(none)"}
title: ${sourceDoc.title}
---
${sourceBody}

CANDIDATE DOCUMENTS
${candidateLines}

Rules:
- Only suggest links with genuine semantic relevance.
- Use SCREAMING_SNAKE_CASE for type (REFERENCES, RELATED_TO, IMPLEMENTS, PART_OF, DESCRIBES, etc.).
- Set confidence based on how strongly the relationship holds (0.0–1.0).
- Keep rationale to one sentence.
- Return an empty suggestions array if no links are appropriate.`,
        });

        // ── Persist suggestions ──────────────────────────────────────────
        const now = new Date();
        const savedRows: SuggestionRow[] = [];

        for (const s of object.suggestions) {
          if (s.confidence < threshold) continue;

          // Match suggestion back to a concrete document.
          const target = candidates.find(
            (d) =>
              d.publicId === s.targetPublicId ||
              d.storeKey === s.targetPublicId,
          );
          if (target === undefined) continue;

          if (!dryRun) {
            const occurrenceKey = makeExternalOccurrenceKey(
              `suggest:${sourceDoc.id}:${target.id}:${s.type}`,
            );
            const edge: SemanticEdge = {
              occurrenceKey,
              sourceDocId: sourceDoc.id,
              targetDocId: target.id,
              type: s.type,
              source: "llm",
              status: "pending",
              confidence: s.confidence,
              rationale: s.rationale,
              model: modelId,
              createdAt: now,
              updatedAt: now,
            };
            await agds.graph.upsertSemanticEdge(edge);
          }

          savedRows.push({
            targetPublicId: target.publicId ?? null,
            targetTitle: target.title,
            type: s.type,
            confidence: s.confidence,
            rationale: s.rationale,
          });
        }

        results.push({
          source: sourceDoc.publicId ?? sourceDoc.storeKey,
          saved: savedRows.length,
          suggestions: savedRows,
        });
      }

      const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
      writeLine(
        { status: "ok", dryRun, threshold, totalSaved, results },
        format,
      );
    });
  },
});
