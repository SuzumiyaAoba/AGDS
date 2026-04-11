import { defineCommand } from "citty";
import type { FetchFormat } from "@agds/runtime";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";

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
    config: CONFIG_ARG,
  },
  async run({ args }) {
    const rawFormat = args.format ?? "md";
    if (!VALID_FORMATS.includes(rawFormat as FetchFormat)) {
      usageError(`Invalid format "${rawFormat}". Valid formats: ${VALID_FORMATS.join(", ")}`);
    }
    const format = rawFormat as FetchFormat;

    await withAgds(args.config, async (agds) => {
      const fetchOpts: import("@agds/runtime").FetchOptions = { format };
      if (args.section !== undefined) fetchOpts.section = args.section;
      const result = await agds.fetch.fetch(args.ref, fetchOpts);
      process.stdout.write(jsonLine({ status: "ok", ...result }));
    });
  },
});
