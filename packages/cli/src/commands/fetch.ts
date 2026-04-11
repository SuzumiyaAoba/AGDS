import { defineCommand } from "citty";
import type { FetchFormat } from "@agds/runtime";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { writeLine } from "../output.js";

// "toon" is handled in the CLI layer: fetch as json then re-encode.
const VALID_FORMATS = ["md", "text", "json", "toon"] as const;
type CliFormat = (typeof VALID_FORMATS)[number];

export default defineCommand({
  meta: {
    name: "fetch",
    description: "Fetch document body with optional section slicing",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description: "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    section: {
      type: "string",
      description: "Heading slug to slice the body to (returns that section and all sub-sections)",
    },
    format: {
      type: "string",
      description: "Output format: md (default), text, json, toon",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
    const rawFormat = (args.format ?? "md") as CliFormat;
    if (!VALID_FORMATS.includes(rawFormat)) {
      usageError(`Invalid format "${rawFormat}". Valid formats: ${VALID_FORMATS.join(", ")}`);
    }

    // For toon, fetch as md so body is a plain string rather than
    // JSON.stringify({body}), which would appear double-encoded in TOON.
    const runtimeFormat: FetchFormat = rawFormat === "toon" ? "md" : rawFormat;

    await withAgds(args.config, async (agds) => {
      const fetchOpts: import("@agds/runtime").FetchOptions = { format: runtimeFormat };
      if (args.section !== undefined) fetchOpts.section = args.section;
      const result = await agds.fetch.fetch(args.ref, fetchOpts);
      if (rawFormat === "toon") {
        const { document, heading, body } = result;
        // Flatten document metadata to top-level keys so TOON does not
        // fall back to YAML-like nesting for a single-object structure.
        const out: Record<string, unknown> = {
          status: "ok",
          publicId: document.publicId ?? null,
          title: document.title,
          storeKey: document.storeKey,
          body,
          format: "toon",
        };
        if (heading !== undefined) out["section"] = heading.text;
        writeLine(out, "toon");
      } else {
        process.stdout.write(jsonLine({ status: "ok", ...result }));
      }
    });
  },
});
