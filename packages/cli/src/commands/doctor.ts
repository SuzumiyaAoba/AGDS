import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Check config, Neo4j connectivity, APOC, and schema version",
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
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
