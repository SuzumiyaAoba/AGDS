import { defineCommand } from "citty";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";
import { VALID_OUTPUT_FORMATS, writeLine, type OutputFormat } from "../output.js";

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
      const rows = await agds.query.query(args.cypher);
      writeLine({ status: "ok", count: rows.length, rows }, format);
    });
  },
});
