import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync vault documents into the graph",
  },
  args: {
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
        const summary = await agds.sync.sync();
        process.stdout.write(jsonLine({ status: "ok", ...summary }));
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
