import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync vault documents into the graph",
  },
  args: {
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
      const summary = await agds.sync.sync();
      process.stdout.write(jsonLine({ status: "ok", ...summary }));
    });
  },
});
