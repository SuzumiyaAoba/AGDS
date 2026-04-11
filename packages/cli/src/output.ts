import { encode } from "@toon-format/toon";
import { jsonLine } from "./error-handler.js";
import type { NeighborResult, BacklinkResult } from "@agds/runtime";

export type OutputFormat = "json" | "toon";

export const VALID_OUTPUT_FORMATS: OutputFormat[] = ["json", "toon"];

/**
 * Serialize `value` to a string in the requested format and write it to
 * stdout. JSON appends a newline (matching jsonLine); TOON appends a trailing
 * newline after the encoded block.
 */
export function writeLine(value: unknown, format: OutputFormat): void {
  if (format === "toon") {
    process.stdout.write(encode(value) + "\n");
  } else {
    process.stdout.write(jsonLine(value));
  }
}

/**
 * Flatten neighbor results into a uniform row shape so TOON can represent
 * them as a compact table instead of falling back to YAML-like nesting.
 */
export function flattenNeighbors(results: NeighborResult[]): object[] {
  return results.map((r) => ({
    publicId: r.document.publicId ?? null,
    title: r.document.title,
    storeKey: r.document.storeKey,
    edgeType: r.edge.type,
    edgeStatus: r.edge.status,
    depth: r.depth,
  }));
}

/**
 * Flatten backlink results into a uniform row shape for TOON tabular output.
 */
export function flattenBacklinks(results: BacklinkResult[]): object[] {
  return results.map((r) => ({
    publicId: r.document.publicId ?? null,
    title: r.document.title,
    storeKey: r.document.storeKey,
    edgeType: r.edge.type,
    edgeStatus: r.edge.status,
  }));
}
