import { defineCommand } from "citty";
import { getMigrationsDir } from "@agds/adapter-neo4j";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

const MIGRATIONS_DIR = getMigrationsDir();

export default defineCommand({
  meta: {
    name: "migrate",
    description: "Apply pending Neo4j schema migrations",
  },
  args: {
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
      const { applied } = await agds.graph.runMigrations(MIGRATIONS_DIR);
      process.stdout.write(jsonLine({ status: "ok", applied }));
    });
  },
});
