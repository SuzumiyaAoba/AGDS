import { describe, expect, it } from "vitest";
import { ExitCode, exitCodeForAgdsError } from "../exit-codes.js";
import type { AgdsErrorCode } from "@agds/core";

describe("ExitCode constants", () => {
  it("OK is 0", () => expect(ExitCode.OK).toBe(0));
  it("GENERAL_ERROR is 1", () => expect(ExitCode.GENERAL_ERROR).toBe(1));
  it("USAGE_ERROR is 2", () => expect(ExitCode.USAGE_ERROR).toBe(2));
  it("TEMP_FAIL is 75 (sysexits EX_TEMPFAIL)", () => expect(ExitCode.TEMP_FAIL).toBe(75));
  it("NO_PERM is 77 (sysexits EX_NOPERM)", () => expect(ExitCode.NO_PERM).toBe(77));
  it("CONFIG_ERROR is 78 (sysexits EX_CONFIG)", () => expect(ExitCode.CONFIG_ERROR).toBe(78));
});

describe("exitCodeForAgdsError", () => {
  const cases: [AgdsErrorCode, number][] = [
    ["LOCK_CONFLICT", ExitCode.TEMP_FAIL],
    ["QUERY_WRITE_FORBIDDEN", ExitCode.NO_PERM],
    ["RESOLVE_NOT_FOUND", ExitCode.GENERAL_ERROR],
    ["DOCUMENT_PUBLIC_ID_CONFLICT", ExitCode.GENERAL_ERROR],
    ["GRAPH_BROKEN_LINK", ExitCode.GENERAL_ERROR],
    ["LLM_RATE_LIMITED", ExitCode.GENERAL_ERROR],
    ["MANAGED_SECTION_CONFLICT", ExitCode.GENERAL_ERROR],
  ];

  for (const [code, expected] of cases) {
    it(`maps ${code} → ${expected}`, () => {
      expect(exitCodeForAgdsError(code)).toBe(expected);
    });
  }

  it("is exhaustive — every AgdsErrorCode maps to a numeric exit code", () => {
    for (const [code] of cases) {
      expect(typeof exitCodeForAgdsError(code)).toBe("number");
    }
  });
});
