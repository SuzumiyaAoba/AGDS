# 013 CLI Core Read Path

> Status: Draft
> Goal: Deliver the first usable local CLI commands
> Depends on: `007-neo4j-schema-and-graph-store.md`, `008-sync-service.md`, `009-verify-service.md`, `011-fetch-navigation-and-query.md`, `012-cli-bootstrap.md`

## Objective

Expose the first usable AGDS command set through the CLI.

## Tasks

1. Wire `init`, `doctor`, and `migrate`.
2. Wire `sync` and `verify`.
3. Wire `resolve`, `fetch`, `neighbors`, and `backlinks`.
4. Wire read-only `query`.
5. Add fixture-based CLI tests for the in-scope commands.

## Done When

- A fresh checkout can run the documented local core flow.
- CLI output is JSON by default.
- The first usable slice works without any LLM dependency.

## Out of Scope

- `suggest`
- `summarize`
- `review`
- HTTP or MCP support
