import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

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
        const results = await agds.navigation.backlinks(args.ref);
        process.stdout.write(
          jsonLine({ status: "ok", count: results.length, backlinks: results }),
        );
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
