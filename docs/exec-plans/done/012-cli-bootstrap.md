# 012 CLI Bootstrap

> Status: Done
> Goal: Wire the composition root and base CLI shell
> Depends on: `002-package-skeletons.md`, `004-ports-and-shared-schemas.md`

## Objective

Create the CLI and runtime wiring without depending on full command
coverage yet.

## Tasks

1. Add the composition root in `@agds/runtime`.
2. Add CLI bootstrap and shared command plumbing.
3. Add deterministic exit-code mapping.
4. Add placeholder handling for commands not yet implemented.

## Done When

- The CLI boots through the composition root.
- Error-to-exit-code mapping is consistent.

## Out of Scope

- Full command coverage
- Fixture-based end-to-end command tests
