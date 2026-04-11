import type { ArgDef } from "citty";
import type { AgdsConfig, AgdsServices } from "@agds/runtime";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "./config-loader.js";
import { handleError, jsonLine } from "./error-handler.js";

/**
 * Shared citty arg definition for the `--config` flag used by every command.
 */
export const CONFIG_ARG = {
  type: "string",
  description: "Path to the config file (default: agds.config.json)",
} as const satisfies ArgDef;

/**
 * Write a USAGE_ERROR JSON line to stderr and exit with code 2.
 *
 * This function never returns.
 */
export function usageError(message: string): never {
  process.stderr.write(jsonLine({ error: "USAGE_ERROR", message }));
  process.exit(2);
}

/**
 * Load config, create the AGDS service bundle, call `fn`, then close.
 *
 * Owns the full try/catch/finally lifecycle so command bodies only need to
 * contain the service call and the stdout write.
 */
export async function withAgds(
  configPath: string | undefined,
  fn: (agds: AgdsServices, config: AgdsConfig) => Promise<void>,
): Promise<void> {
  try {
    const config = await loadConfig(configPath);
    const agds = createAgds(config);
    try {
      await fn(agds, config);
    } finally {
      await agds.close();
    }
  } catch (err) {
    handleError(err);
  }
}
