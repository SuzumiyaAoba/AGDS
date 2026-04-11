import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

export default defineCommand({
  meta: {
    name: "resolve",
    description: "Resolve a reference to a Document (JSON output)",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description:
        "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    config: {
      type: "string",
      description: "Path to the config file (default: agds.config.json)",
    },
  },
  async run({ args }) {
    try {
      const config = await loadConfig(args.config);
      const agds = createAgds(config);
      try {
        const result = await agds.resolve.resolve(args.ref);
        process.stdout.write(jsonLine({ status: "ok", ...result }));
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
