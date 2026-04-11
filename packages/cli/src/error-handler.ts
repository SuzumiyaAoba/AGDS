import { AgdsError } from "@agds/core";
import { ExitCode, exitCodeForAgdsError } from "@agds/runtime";

/**
 * Serialize `value` to a single-line JSON string terminated with a newline.
 */
function jsonLine(value: unknown): string {
  return JSON.stringify(value) + "\n";
}

/**
 * Handle a caught error: write a JSON-formatted message to stderr and exit
 * with the appropriate code.
 *
 * This function never returns.
 */
export function handleError(err: unknown): never {
  if (err instanceof AgdsError) {
    process.stderr.write(
      jsonLine({
        error: err.code,
        message: err.message,
        details: err.details,
      }),
    );
    process.exit(exitCodeForAgdsError(err.code));
  }

  if (err instanceof Error) {
    process.stderr.write(
      jsonLine({ error: "INTERNAL_ERROR", message: err.message }),
    );
    process.exit(ExitCode.GENERAL_ERROR);
  }

  process.stderr.write(
    jsonLine({ error: "UNKNOWN_ERROR", message: String(err) }),
  );
  process.exit(ExitCode.GENERAL_ERROR);
}
