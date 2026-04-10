import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { AgdsFrontmatter } from "./types.js";

export interface FrontmatterResult {
  agds: AgdsFrontmatter;
  passthrough: Record<string, unknown>;
  /**
   * The raw document string with the frontmatter block removed.
   * Leading newlines left by the delimiter are stripped.
   */
  body: string;
  /** Byte length of the frontmatter block (including delimiters and trailing newline). */
  frontmatterLength: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FrontmatterRecordSchema = z.record(z.string(), z.unknown());
const AgdsFrontmatterSchema = z.object({
  id: z.string().optional(),
  tags: z.preprocess(
    (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : value,
    z.array(z.string()).optional(),
  ),
  summary: z.string().optional(),
  doNotSuggest: z.boolean().optional(),
  frozen: z.boolean().optional(),
});

/**
 * Extract and parse YAML frontmatter from a Markdown document.
 *
 * The `agds` top-level key is separated from other fields so the rest of the
 * application only sees the typed AGDS namespace; all other fields are kept
 * in `passthrough` for verbatim round-trip writeback.
 */
export function extractFrontmatter(raw: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(raw);

  if (match === null) {
    return {
      agds: {},
      passthrough: {},
      body: raw,
      frontmatterLength: 0,
    };
  }

  const yamlBlock = match[1] ?? "";
  const fullMatch = match[0];

  let parsed: Record<string, unknown> = {};
  try {
    const result = parseYaml(yamlBlock);
    const validated = FrontmatterRecordSchema.safeParse(result);
    if (validated.success) {
      parsed = validated.data;
    }
  } catch {
    // Malformed frontmatter: treat as empty and pass the raw block through.
    parsed = {};
  }

  const { agds: rawAgds, ...passthrough } = parsed;
  const agds = parseAgdsFrontmatter(rawAgds);

  return {
    agds,
    passthrough,
    body: raw.slice(fullMatch.length),
    frontmatterLength: fullMatch.length,
  };
}

function parseAgdsFrontmatter(raw: unknown): AgdsFrontmatter {
  const parsed = AgdsFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }

  const result: AgdsFrontmatter = {};
  if (parsed.data.id !== undefined) result.id = parsed.data.id;
  if (parsed.data.tags !== undefined) result.tags = parsed.data.tags;
  if (parsed.data.summary !== undefined) result.summary = parsed.data.summary;
  if (parsed.data.doNotSuggest !== undefined) {
    result.doNotSuggest = parsed.data.doNotSuggest;
  }
  if (parsed.data.frozen !== undefined) result.frozen = parsed.data.frozen;
  return result;
}
