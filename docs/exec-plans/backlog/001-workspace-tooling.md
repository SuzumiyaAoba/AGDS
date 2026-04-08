# 001 Workspace Tooling

> Status: Draft
> Goal: Make the repository installable and runnable as a `pnpm` workspace

## Objective

Set up the minimum root-level tooling required before package
implementation starts.

## Tasks

1. Add `pnpm-workspace.yaml`.
2. Add root `package.json`.
3. Add root scripts for build, lint, and test.
4. Add shared TypeScript base configuration.

## Done When

- `pnpm install` works from the repository root.
- root scripts resolve workspace packages correctly.

## Out of Scope

- Package source code
- Runtime behavior
