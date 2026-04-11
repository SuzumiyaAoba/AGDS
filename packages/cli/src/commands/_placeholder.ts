import { defineCommand } from "citty";
import { jsonLine } from "../error-handler.js";

/**
 * Create a stub command that prints a JSON "not yet implemented" message
 * and exits with code 1.  Used for commands planned in later exec-plans.
 */
export function placeholderCommand(name: string, description: string) {
  return defineCommand({
    meta: { name, description },
    async run() {
      process.stdout.write(jsonLine({ status: "not_implemented", command: name }));
      process.exit(1);
    },
  });
}
