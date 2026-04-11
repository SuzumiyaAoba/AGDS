import { defineCommand } from "citty";
import type { EdgeStatusFilter } from "@agds/runtime";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, usageError, withAgds } from "../command-runner.js";

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
    config: CONFIG_ARG,
  },
  async run({ args }) {
    const rawStatus = args.status ?? "active";
    if (!VALID_STATUSES.includes(rawStatus as EdgeStatusFilter)) {
      usageError(`Invalid status "${rawStatus}". Valid statuses: ${VALID_STATUSES.join(", ")}`);
    }
    const status = rawStatus as EdgeStatusFilter;

    const rawDepth = args.depth;
    const depth = rawDepth !== undefined ? parseInt(rawDepth, 10) : 1;
    if (isNaN(depth) || depth < 1) {
      usageError(`Invalid depth "${rawDepth}". Must be a positive integer.`);
    }

    await withAgds(args.config, async (agds) => {
      const neighborOpts: import("@agds/runtime").NeighborsOptions = { depth, status };
      if (args.type !== undefined) neighborOpts.type = args.type;
      const results = await agds.navigation.neighbors(args.ref, neighborOpts);
      process.stdout.write(
        jsonLine({ status: "ok", count: results.length, neighbors: results }),
      );
    });
  },
});
