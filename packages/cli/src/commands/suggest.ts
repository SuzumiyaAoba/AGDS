import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { VALID_OUTPUT_FORMATS, writeLine, type OutputFormat } from "../output.js";

const DEFAULT_URL = "http://localhost:1234/v1";
const DEFAULT_THRESHOLD = 0.5;

const MANAGED_START = "<!-- agds:suggested-links start -->";
const MANAGED_END = "<!-- agds:suggested-links end -->";

/** Schema for validating the LLM's JSON response. */
const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      targetPublicId: z
        .string()
        .describe("publicId of the target document"),
      type: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
        .describe("Relationship type in SCREAMING_SNAKE_CASE"),
      confidence: z.number().min(0).max(1),
      rationale: z.string().describe("One-sentence explanation"),
    }),
  ),
});

/**
 * Replace (or append) the managed suggested-links section in a Markdown file.
 *
 * Existing entries in the section that are NOT in `newLines` are preserved so
 * that prior human edits (removing `?` to confirm a link) survive re-runs.
 */
function updateManagedSection(content: string, newLines: string[]): string {
  const startIdx = content.indexOf(MANAGED_START);
  const endIdx = content.indexOf(MANAGED_END);

  let existingLines: string[] = [];
  if (startIdx !== -1 && endIdx !== -1) {
    const inner = content.slice(startIdx + MANAGED_START.length, endIdx);
    existingLines = inner
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  // Merge: keep existing entries, append only new ones not already present.
  const merged = [...existingLines];
  for (const line of newLines) {
    if (!merged.includes(line)) {
      merged.push(line);
    }
  }

  if (merged.length === 0) return content;

  const section =
    `${MANAGED_START}\n` +
    merged.map((l) => l).join("\n") +
    `\n${MANAGED_END}`;

  if (startIdx !== -1 && endIdx !== -1) {
    return (
      content.slice(0, startIdx) +
      section +
      content.slice(endIdx + MANAGED_END.length)
    );
  }

  return content.trimEnd() + "\n\n" + section + "\n";
}

export default defineCommand({
  meta: {
    name: "suggest",
    description:
      "Use an LLM to suggest links and write them as [?[...]] into each document",
  },
  args: {
    ref: {
      type: "positional",
      required: false,
      description:
        "Source document reference. Omit to process all documents.",
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
      description: `Minimum confidence to write a suggestion, 0–1 (default: ${DEFAULT_THRESHOLD})`,
    },
    "dry-run": {
      type: "boolean",
      description: "Print suggestions without modifying any files",
      default: false,
    },
    format: {
      type: "string",
      description: "Output format: json (default), toon",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
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

    const lmstudio = createOpenAICompatible({
      name: "lmstudio",
      baseURL,
      apiKey: "lm-studio",
    });

    await withAgds(args.config, async (agds, config) => {
      const allDocs = await agds.graph.listDocuments(config.vaultId);
      const activeDocs = allDocs.filter((d) => !d.archived);

      let sourceDocs = activeDocs;
      if (args.ref !== undefined) {
        const { document } = await agds.resolve.resolve(args.ref);
        sourceDocs = [document];
      }

      type SuggestionRow = {
        target: string;
        targetTitle: string;
        type: string;
        confidence: number;
        rationale: string;
        linkLine: string;
      };

      type SourceResult = {
        source: string;
        filePath: string;
        written: number;
        suggestions: SuggestionRow[];
      };

      const results: SourceResult[] = [];

      for (const sourceDoc of sourceDocs) {
        const candidates = activeDocs.filter((d) => d.id !== sourceDoc.id);
        if (candidates.length === 0) continue;

        // Fetch body as plain text for the LLM.
        const sourceRef = sourceDoc.publicId ?? sourceDoc.storeKey;
        const { body: sourceBody } = await agds.fetch.fetch(sourceRef, {
          format: "text",
        });

        const candidateLines = candidates
          .map((d) => `- publicId: ${d.publicId ?? d.storeKey}  title: ${d.title}`)
          .join("\n");

        // ── LLM call ────────────────────────────────────────────────────
        const { text } = await generateText({
          model: lmstudio(modelId),
          system:
            "You are a knowledge graph assistant. " +
            "Respond with valid JSON only — no prose, no markdown fences.",
          prompt: `Suggest meaningful directed links FROM the source document TO relevant candidates.

SOURCE DOCUMENT
publicId: ${sourceDoc.publicId ?? "(none)"}
title: ${sourceDoc.title}
---
${sourceBody}

CANDIDATE DOCUMENTS
${candidateLines}

Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "targetPublicId": "<publicId from the candidate list>",
      "type": "<SCREAMING_SNAKE_CASE>",
      "confidence": <0.0–1.0>,
      "rationale": "<one sentence>"
    }
  ]
}

Valid types: REFERENCES, RELATED_TO, IMPLEMENTS, PART_OF, DESCRIBES, EXTENDS, USES.
Return {"suggestions":[]} if no links are appropriate.`,
        });

        // Parse LLM response (strip markdown fences if present).
        const jsonText = text
          .replace(/^```(?:json)?\s*/m, "")
          .replace(/\s*```\s*$/m, "")
          .trim();
        const { suggestions: rawSuggestions } = SuggestionSchema.parse(
          JSON.parse(jsonText),
        );

        // Build link lines for the managed section.
        const suggestionRows: SuggestionRow[] = [];

        for (const s of rawSuggestions) {
          if (s.confidence < threshold) continue;

          const target = candidates.find(
            (d) =>
              d.publicId === s.targetPublicId ||
              d.storeKey === s.targetPublicId,
          );
          if (target === undefined) continue;

          // Use storeKey as the link target so agds sync can resolve it.
          const linkTarget = target.storeKey;
          const displayText = target.title;
          // Include the relationship type annotation.
          const linkLine = `[?[${displayText}|${s.type}](${linkTarget})]`;

          suggestionRows.push({
            target: linkTarget,
            targetTitle: target.title,
            type: s.type,
            confidence: s.confidence,
            rationale: s.rationale,
            linkLine,
          });
        }

        // ── Write suggestions into the Markdown file ─────────────────────
        const filePath = join(config.vault.root, sourceDoc.storeKey);

        if (!dryRun && suggestionRows.length > 0) {
          const original = await readFile(filePath, "utf8");
          const updated = updateManagedSection(
            original,
            suggestionRows.map((r) => r.linkLine),
          );
          await writeFile(filePath, updated, "utf8");
        }

        results.push({
          source: sourceDoc.publicId ?? sourceDoc.storeKey,
          filePath,
          written: dryRun ? 0 : suggestionRows.length,
          suggestions: suggestionRows,
        });
      }

      const totalWritten = results.reduce((sum, r) => sum + r.written, 0);
      writeLine(
        {
          status: "ok",
          dryRun,
          threshold,
          totalWritten,
          hint: dryRun
            ? "Run without --dry-run to write suggestions, then run `agds sync`."
            : totalWritten > 0
              ? "Run `agds sync` to load the new suggestions into the graph."
              : undefined,
          results,
        },
        format,
      );
    });
  },
});
