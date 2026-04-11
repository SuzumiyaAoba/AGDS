import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import { getMigrationsDir } from "@agds/adapter-neo4j";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

const MIGRATIONS_DIR = getMigrationsDir();

const CONFIG_TEMPLATE = {
  vaultId: "my-vault",
  vault: {
    root: "./vault",
  },
  neo4j: {
    url: "bolt://localhost:7687",
    username: "neo4j",
    password: "your-neo4j-password",
  },
};

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize vault config and install Neo4j schema",
  },
  args: {
    config: {
      type: "string",
      description: "Path to the config file (default: agds.config.json)",
    },
  },
  async run({ args }) {
    const configPath = resolve(process.cwd(), args.config ?? "agds.config.json");

    // Attempt to create the config file exclusively (O_EXCL = fail if exists).
    // This avoids a TOCTOU race between checking existence and writing.
    try {
      const fd = await open(configPath, "wx");
      try {
        await fd.writeFile(JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n", "utf8");
      } finally {
        await fd.close();
      }
      process.stdout.write(
        jsonLine({ status: "config_created", path: configPath }),
      );
      process.stdout.write(
        jsonLine({
          status: "hint",
          message:
            "Edit agds.config.json (set vault.root and neo4j.password), then run `agds init` again.",
        }),
      );
      return;
    } catch (err) {
      // EEXIST means the config already exists — proceed to apply migrations.
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    // Config exists — connect and apply all pending schema migrations.
    try {
      const config = await loadConfig(configPath);
      const agds = createAgds(config);
      try {
        const { apocVersion } = await agds.graph.verifyConnectivity();
        const { applied } = await agds.graph.runMigrations(MIGRATIONS_DIR);
        process.stdout.write(
          jsonLine({ status: "ok", apocVersion, applied }),
        );
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
