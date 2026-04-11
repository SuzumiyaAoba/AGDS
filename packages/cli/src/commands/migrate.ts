import { defineCommand } from "citty";
import { getMigrationsDir } from "@agds/adapter-neo4j";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

const MIGRATIONS_DIR = getMigrationsDir();

export default defineCommand({
  meta: {
    name: "migrate",
    description: "Apply pending Neo4j schema migrations",
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
        const { applied } = await agds.graph.runMigrations(MIGRATIONS_DIR);
        process.stdout.write(jsonLine({ status: "ok", applied }));
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
