import { defineCommand } from "citty";
import type { FetchFormat } from "@agds/runtime";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

const VALID_FORMATS: FetchFormat[] = ["md", "text", "json"];

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
      description: "Output format: md (default), text, json",
    },
    config: {
      type: "string",
      description: "Path to the config file (default: agds.config.json)",
    },
  },
  async run({ args }) {
    const rawFormat = args.format ?? "md";
    if (!VALID_FORMATS.includes(rawFormat as FetchFormat)) {
      process.stderr.write(
        jsonLine({
          error: "USAGE_ERROR",
          message: `Invalid format "${rawFormat}". Valid formats: ${VALID_FORMATS.join(", ")}`,
        }),
      );
      process.exit(2);
    }
    const format = rawFormat as FetchFormat;

    try {
      const config = await loadConfig(args.config);
      const agds = createAgds(config);
      try {
        const fetchOpts: import("@agds/runtime").FetchOptions = { format };
        if (args.section !== undefined) fetchOpts.section = args.section;
        const result = await agds.fetch.fetch(args.ref, fetchOpts);
        process.stdout.write(jsonLine({ status: "ok", ...result }));
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
