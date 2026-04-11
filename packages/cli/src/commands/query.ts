import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

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
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
      const rows = await agds.query.query(args.cypher);
      process.stdout.write(
        jsonLine({ status: "ok", count: rows.length, rows }),
      );
    });
  },
});
