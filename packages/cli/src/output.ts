import { encode } from "@toon-format/toon";
import { jsonLine } from "./error-handler.js";

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
