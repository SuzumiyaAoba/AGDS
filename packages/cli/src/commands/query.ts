import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

export default defineCommand({
  meta: {
    name: "query",
    description: "Run a read-only Cypher query against the graph",
  },
  args: {
    cypher: {
      type: "positional",
      required: true,
      description: "Cypher query to execute (read-only)",
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
        const rows = await agds.query.query(args.cypher);
        process.stdout.write(
          jsonLine({ status: "ok", count: rows.length, rows }),
        );
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
