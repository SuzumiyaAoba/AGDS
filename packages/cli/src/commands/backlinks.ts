import { defineCommand } from "citty";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { VALID_OUTPUT_FORMATS, flattenBacklinks, writeLine, type OutputFormat } from "../output.js";

export default defineCommand({
  meta: {
    name: "backlinks",
    description: "List documents pointing at the given document",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description: "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    format: {
      type: "string",
      description: "Output format: json (default), toon",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
    const rawFormat = args.format ?? "json";
    if (!VALID_OUTPUT_FORMATS.includes(rawFormat as OutputFormat)) {
      usageError(`Invalid format "${rawFormat}". Valid formats: ${VALID_OUTPUT_FORMATS.join(", ")}`);
    }
    const format = rawFormat as OutputFormat;

    await withAgds(args.config, async (agds) => {
      const results = await agds.navigation.backlinks(args.ref);
      const backlinks = format === "toon" ? flattenBacklinks(results) : results;
      writeLine({ status: "ok", count: results.length, backlinks }, format);
    });
  },
});
