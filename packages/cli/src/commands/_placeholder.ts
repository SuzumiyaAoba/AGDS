import { defineCommand } from "citty";

/**
 * Create a stub command that prints a JSON "not yet implemented" message
 * and exits with code 1.  Used for commands planned in later exec-plans.
 */
export function placeholderCommand(name: string, description: string) {
  return defineCommand({
    meta: { name, description },
    async run() {
      process.stdout.write(
        JSON.stringify({ status: "not_implemented", command: name }) + "\n",
      );
      process.exit(1);
    },
  });
}
