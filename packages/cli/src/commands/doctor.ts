import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Check config, Neo4j connectivity, APOC, and schema version",
  },
  args: {
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds, config) => {
      const [{ apocVersion }, schemaVersion] = await Promise.all([
        agds.graph.verifyConnectivity(),
        agds.graph.getSchemaVersion(),
      ]);
      process.stdout.write(
        jsonLine({
          status: "ok",
          config: {
            vaultId: config.vaultId,
            vaultRoot: config.vault.root,
            neo4jUrl: config.neo4j.url ?? "bolt://localhost:7687",
          },
          neo4j: { connected: true, apocVersion },
          schemaVersion,
        }),
      );
    });
  },
});
