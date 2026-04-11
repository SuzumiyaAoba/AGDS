import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

export default defineCommand({
  meta: {
    name: "verify",
    description: "Report broken links and orphaned graph nodes",
  },
  args: {
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
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
    });
  },
});
