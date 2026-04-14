import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { VALID_OUTPUT_FORMATS, writeLine, type OutputFormat } from "../output.js";

const DEFAULT_URL = "http://localhost:1234/v1";
const DEFAULT_THRESHOLD = 0.5;

/**
 * Schema for the LLM response.
 * Each replacement identifies a span of text in the document to turn into a
 * pending link token `[?[displayText|TYPE](target)]`.
 */
const ReplacementSchema = z.object({
  replacements: z.array(
    z.object({
      /** Exact phrase as it appears in the document body. */
      originalText: z.string().min(1),
      /** Display text for the link (usually identical to originalText). */
      displayText: z.string().min(1),
      /** Relationship type in SCREAMING_SNAKE_CASE. */
      type: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
        .describe("e.g. REFERENCES, RELATED_TO, IMPLEMENTS, PART_OF, DESCRIBES"),
      /**
       * publicId or storeKey of an existing document, OR a suggested kebab-case
       * filename (e.g. "new-concept.md") for a document that does not yet exist.
       */
      target: z.string().min(1),
      /** true when `target` is a suggested new document, false when it matches an existing one. */
      isNew: z.boolean(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().describe("One-sentence explanation"),
    }),
  ),
});

/** Regex that matches any AGDS link token (explicit or suggestion). */
const LINK_TOKEN_RE = /\[?\??\[([^\]|]*?)(?:\|[A-Z][A-Z0-9_]*)?\]\([^)]*\)\]?/g;
/** Regex that matches Markdown fenced code blocks. */
const CODE_FENCE_RE = /^```[\s\S]*?^```/gm;
/** Regex that matches inline code spans (single-line only — never cross newlines). */
const INLINE_CODE_RE = /`[^`\n]+`/g;

/**
 * Collect the character ranges (start, end) that should be excluded from
 * in-place replacement: existing link tokens and code blocks/spans.
 */
function protectedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const re of [LINK_TOKEN_RE, CODE_FENCE_RE, INLINE_CODE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isProtected(start: number, end: number, ranges: [number, number][]): boolean {
  return ranges.some(([rs, re]) => start < re && end > rs);
}

/**
 * Replace the first unprotected occurrence of `original` in `text` with
 * `replacement`. Returns the updated text and whether a replacement was made.
 */
function replaceFirst(
  text: string,
  original: string,
  replacement: string,
): { result: string; replaced: boolean } {
  // Build protected ranges fresh each time so newly inserted tokens are respected.
  const ranges = protectedRanges(text);
  const idx = text.indexOf(original);
  if (idx === -1) return { result: text, replaced: false };
  if (isProtected(idx, idx + original.length, ranges)) {
    return { result: text, replaced: false };
  }
  return {
    result: text.slice(0, idx) + replacement + text.slice(idx + original.length),
    replaced: true,
  };
}

export default defineCommand({
  meta: {
    name: "suggest",
    description:
      "Rewrite keywords in a document as [?[text|TYPE](target)] pending link tokens",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description:
        "Document to process — publicId, storeKey, file path, or title",
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
      description: `Minimum confidence to apply a replacement, 0–1 (default: ${DEFAULT_THRESHOLD})`,
    },
    "dry-run": {
      type: "boolean",
      description: "Show proposed replacements without modifying the file",
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
      args.threshold !== undefined ? parseFloat(args.threshold) : DEFAULT_THRESHOLD;
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      usageError(`Invalid threshold "${args.threshold}". Must be a number between 0 and 1.`);
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
      // Resolve the target document.
      const { document: sourceDoc } = await agds.resolve.resolve(args.ref);

      // Read the raw file content — used both for the LLM prompt and for
      // in-place replacement, so the two always see identical text.
      const filePath = join(config.vault.root, sourceDoc.storeKey);
      const originalFileContent = await readFile(filePath, "utf8");
      let fileContent = originalFileContent;

      // Strip YAML frontmatter before passing to the LLM so it only sees
      // the Markdown body.  The replacement still runs on fileContent (with
      // frontmatter) so indexOf positions remain valid.
      const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n*/;
      const bodyText = fileContent.replace(FRONTMATTER_RE, "");

      // Build the candidate list (all other active docs).
      const allDocs = await agds.graph.listDocuments(config.vaultId);
      const candidates = allDocs.filter((d) => !d.archived && d.id !== sourceDoc.id);

      const candidateLines = candidates
        .map((d) => `- publicId: ${d.publicId ?? d.storeKey}  title: ${d.title}  storeKey: ${d.storeKey}`)
        .join("\n");

      // ── LLM call ──────────────────────────────────────────────────────────
      const { text: llmText } = await generateText({
        model: lmstudio(modelId),
        system:
          "You are a knowledge graph assistant. " +
          "Respond with valid JSON only — no prose, no markdown fences.",
        prompt: `You are given a Markdown document and a list of existing documents in the same vault.
Identify phrases or keywords in the document that should become links — either to an existing document
or to a new document that does not yet exist but should be created.

DOCUMENT
title: ${sourceDoc.title}
---
${bodyText}

EXISTING DOCUMENTS
${candidateLines}

Return a JSON object with this exact structure:
{
  "replacements": [
    {
      "originalText": "<exact phrase as it appears in the document>",
      "displayText": "<text to show in the link, usually same as originalText>",
      "type": "<SCREAMING_SNAKE_CASE relationship type>",
      "target": "<publicId/storeKey of an existing doc, OR a kebab-case filename for a new doc>",
      "isNew": <true if target does not exist yet, false if it matches an existing document>,
      "confidence": <0.0–1.0>,
      "rationale": "<one sentence>"
    }
  ]
}

Rules:
- originalText must be a verbatim substring of the document.
- Prefer specific, meaningful phrases over single common words.
- Valid types: REFERENCES, RELATED_TO, IMPLEMENTS, PART_OF, DESCRIBES, EXTENDS, USES.
- Do not suggest links for text that is already a link token.
- For existing targets: use the exact publicId or storeKey from the EXISTING DOCUMENTS list.
- For new targets: use a concise kebab-case filename ending in .md (e.g. "hexagonal-architecture.md").
- Return {"replacements":[]} if no appropriate links are found.`,
      });

      // Parse LLM response.
      const jsonText = llmText
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();
      const { replacements: raw } = ReplacementSchema.parse(JSON.parse(jsonText));

      // ── Apply replacements to the raw file content ─────────────────────

      type AppliedRow = {
        originalText: string;
        linkToken: string;
        type: string;
        target: string;
        isNew: boolean;
        confidence: number;
        rationale: string;
        applied: boolean;
      };

      const applied: AppliedRow[] = [];

      for (const r of raw) {
        if (r.confidence < threshold) continue;

        // Try to resolve to an existing document.
        const targetDoc = candidates.find(
          (d) => d.publicId === r.target || d.storeKey === r.target,
        );

        // Use the resolved storeKey when the doc exists; otherwise use the
        // LLM-supplied target directly as a suggested storeKey for a new doc.
        const linkTarget = targetDoc?.storeKey ?? r.target;
        const isNew = targetDoc === undefined;
        const linkToken = `[?[${r.displayText}|${r.type}](${linkTarget})]`;

        if (!dryRun) {
          const { result, replaced } = replaceFirst(fileContent, r.originalText, linkToken);
          if (replaced) {
            fileContent = result;
            applied.push({ ...r, target: linkTarget, isNew, linkToken, applied: true });
          } else {
            applied.push({ ...r, target: linkTarget, isNew, linkToken, applied: false });
          }
        } else {
          // dry-run: simulate the replacement to build the diff later.
          const { result, replaced } = replaceFirst(fileContent, r.originalText, linkToken);
          if (replaced) {
            fileContent = result;
          }
          applied.push({ ...r, target: linkTarget, isNew, linkToken, applied: replaced });
        }
      }

      const written = applied.filter((r) => r.applied).length;

      if (dryRun) {
        // Generate a unified diff showing what would change.
        const patch =
          written > 0
            ? createTwoFilesPatch(filePath, filePath, originalFileContent, fileContent, "original", "proposed")
            : null;

        writeLine(
          {
            status: "ok",
            dryRun: true,
            file: filePath,
            written,
            diff: patch,
            replacements: applied,
          },
          format,
        );
      } else {
        await writeFile(filePath, fileContent, "utf8");

        writeLine(
          {
            status: "ok",
            dryRun: false,
            file: filePath,
            written,
            hint:
              written > 0
                ? "Run `agds sync` to load the new suggestions into the graph."
                : undefined,
            replacements: applied,
          },
          format,
        );
      }
    });
  },
});
