# 002 Package Skeletons

> Status: Draft
> Goal: Create the initial package layout without product logic
> Depends on: `001-workspace-tooling.md`

## Objective

Create the package directories and minimal entrypoints needed by the
planned architecture.

## Tasks

1. Create `packages/core`.
2. Create `packages/schema`.
3. Create `packages/runtime`.
4. Create `packages/adapter-neo4j`.
5. Create `packages/adapter-store-fs`.
6. Create `packages/cli`.
7. Add minimal manifests and entry files for each package.

## Done When

- Every planned package exists.
- Workspace build/test/lint can traverse all packages without missing-entry errors.

## Out of Scope

- Service logic
- Adapter behavior
