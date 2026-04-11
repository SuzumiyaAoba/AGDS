import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { AgdsConfig } from "@agds/runtime";
import { ExitCode } from "@agds/runtime";
import { jsonLine } from "./error-handler.js";

const AgdsConfigSchema = z.object({
  vaultId: z.string().min(1),
  vault: z.object({
    root: z.string().min(1),
    extensions: z.array(z.string()).optional(),
    excludeDirs: z.array(z.string()).optional(),
  }),
  neo4j: z.object({
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(1),
    database: z.string().optional(),
  }),
});

/**
 * Load and validate the AGDS configuration.
 *
 * Resolution order:
 * 1. The file at `configPath` (or `agds.config.json` in CWD).
 * 2. `AGDS_NEO4J_PASSWORD` env var overrides `neo4j.password`.
 *
 * Exits with `ExitCode.CONFIG_ERROR` on any load or validation failure.
 */
export async function loadConfig(configPath?: string): Promise<AgdsConfig> {
  const path = configPath ?? resolve(process.cwd(), "agds.config.json");

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    process.stderr.write(jsonLine({ error: "CONFIG_ERROR", message: `Cannot read config file: ${path}` }));
    process.exit(ExitCode.CONFIG_ERROR);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    process.stderr.write(jsonLine({ error: "CONFIG_ERROR", message: `Config file is not valid JSON: ${path}` }));
    process.exit(ExitCode.CONFIG_ERROR);
  }

  // Allow the Neo4j password to be supplied via environment variable.
  const envPassword = process.env["AGDS_NEO4J_PASSWORD"];
  if (envPassword !== undefined && typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    const neo4j = (obj["neo4j"] ?? {}) as Record<string, unknown>;
    obj["neo4j"] = { ...neo4j, password: envPassword };
  }

  const result = AgdsConfigSchema.safeParse(json);
  if (!result.success) {
    process.stderr.write(jsonLine({ error: "CONFIG_ERROR", message: "Invalid config", issues: result.error.issues }));
    process.exit(ExitCode.CONFIG_ERROR);
  }

  return result.data as AgdsConfig;
}
