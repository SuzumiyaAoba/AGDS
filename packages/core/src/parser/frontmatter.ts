import { parse as parseYaml } from "yaml";
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
    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      parsed = result as Record<string, unknown>;
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
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const src = raw as Record<string, unknown>;
  const result: AgdsFrontmatter = {};

  if (typeof src["id"] === "string") result.id = src["id"];
  if (Array.isArray(src["tags"])) {
    result.tags = src["tags"].filter((t): t is string => typeof t === "string");
  }
  if (typeof src["summary"] === "string") result.summary = src["summary"];
  if (typeof src["doNotSuggest"] === "boolean") result.doNotSuggest = src["doNotSuggest"];
  if (typeof src["frozen"] === "boolean") result.frozen = src["frozen"];

  return result;
}
