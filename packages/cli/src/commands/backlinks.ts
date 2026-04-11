import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

export default defineCommand({
  meta: {
    name: "backlinks",
    description: "List documents pointing at the given document",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description: "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
      const results = await agds.navigation.backlinks(args.ref);
      process.stdout.write(
        jsonLine({ status: "ok", count: results.length, backlinks: results }),
      );
    });
  },
});
