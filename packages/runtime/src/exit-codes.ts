import type { AgdsErrorCode } from "@agds/core";

/**
 * Process exit codes used by the AGDS CLI.
 *
 * Values follow POSIX sysexits.h conventions where applicable.
 */
export const ExitCode = {
  /** Successful completion. */
  OK: 0,
  /** General / unclassified error. */
  GENERAL_ERROR: 1,
  /** Incorrect CLI usage (bad arguments). */
  USAGE_ERROR: 2,
  /** Service temporarily unavailable — retry later (e.g. lock contention). */
  TEMP_FAIL: 75,
  /** Operation not permitted (e.g. write rejected in read-only mode). */
  NO_PERM: 77,
  /** Configuration error. */
  CONFIG_ERROR: 78,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Map an `AgdsErrorCode` to the appropriate process exit code.
 *
 * Unknown codes fall back to `ExitCode.GENERAL_ERROR`.
 */
export function exitCodeForAgdsError(code: AgdsErrorCode): number {
  switch (code) {
    case "LOCK_CONFLICT":
      return ExitCode.TEMP_FAIL;
    case "QUERY_WRITE_FORBIDDEN":
      return ExitCode.NO_PERM;
    case "RESOLVE_NOT_FOUND":
    case "DOCUMENT_PUBLIC_ID_CONFLICT":
    case "GRAPH_BROKEN_LINK":
    case "LLM_RATE_LIMITED":
    case "MANAGED_SECTION_CONFLICT":
      return ExitCode.GENERAL_ERROR;
  }
}
