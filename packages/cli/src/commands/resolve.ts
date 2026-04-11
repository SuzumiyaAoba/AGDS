import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";
import { CONFIG_ARG, withAgds } from "../command-runner.js";

export default defineCommand({
  meta: {
    name: "resolve",
    description: "Resolve a reference to a Document (JSON output)",
  },
  args: {
    ref: {
      type: "positional",
      required: true,
      description:
        "Document reference — publicId, storeKey, path, title, or AGDS link token",
    },
    config: CONFIG_ARG,
  },
  async run({ args }) {
    await withAgds(args.config, async (agds) => {
      const result = await agds.resolve.resolve(args.ref);
      process.stdout.write(jsonLine({ status: "ok", ...result }));
    });
  },
});
