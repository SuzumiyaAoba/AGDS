import { defineCommand } from "citty";
import type { EdgeStatusFilter } from "@agds/runtime";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

const VALID_STATUSES: EdgeStatusFilter[] = ["active", "pending", "any"];

export default defineCommand({
  meta: {
    name: "neighbors",
    description: "List documents reachable via outgoing edges",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description: "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    type: {
      type: "string",
      description: "Filter by relationship type",
    },
    depth: {
      type: "string",
      description: "BFS depth (default: 1)",
    },
    status: {
      type: "string",
      description: "Edge status filter: active (default), pending, any",
    },
    config: {
      type: "string",
      description: "Path to the config file (default: agds.config.json)",
    },
  },
  async run({ args }) {
    const rawStatus = args.status ?? "active";
    if (!VALID_STATUSES.includes(rawStatus as EdgeStatusFilter)) {
      process.stderr.write(
        jsonLine({
          error: "USAGE_ERROR",
          message: `Invalid status "${rawStatus}". Valid statuses: ${VALID_STATUSES.join(", ")}`,
        }),
      );
      process.exit(2);
    }
    const status = rawStatus as EdgeStatusFilter;

    const rawDepth = args.depth;
    const depth = rawDepth !== undefined ? parseInt(rawDepth, 10) : 1;
    if (isNaN(depth) || depth < 1) {
      process.stderr.write(
        jsonLine({
          error: "USAGE_ERROR",
          message: `Invalid depth "${rawDepth}". Must be a positive integer.`,
        }),
      );
      process.exit(2);
    }

    try {
      const config = await loadConfig(args.config);
      const agds = createAgds(config);
      try {
        const neighborOpts: import("@agds/runtime").NeighborsOptions = { depth, status };
        if (args.type !== undefined) neighborOpts.type = args.type;
        const results = await agds.navigation.neighbors(args.ref, neighborOpts);
        process.stdout.write(
          jsonLine({ status: "ok", count: results.length, neighbors: results }),
        );
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
