import { defineCommand } from "citty";
import { createAgds } from "@agds/runtime";
import { loadConfig } from "../config-loader.js";
import { handleError, jsonLine } from "../error-handler.js";

export default defineCommand({
  meta: {
    name: "verify",
    description: "Report broken links and orphaned graph nodes",
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
        const result = await agds.verify.verify();
        process.stdout.write(
          jsonLine({
            status: result.issues.length > 0 ? "issues_found" : "ok",
            count: result.issues.length,
            issues: result.issues,
          }),
        );
        // Use exitCode rather than process.exit() so the finally block runs
        // and the Neo4j driver connection pool is properly released.
        if (result.issues.length > 0) process.exitCode = 1;
      } finally {
        await agds.close();
      }
    } catch (err) {
      handleError(err);
    }
  },
});
