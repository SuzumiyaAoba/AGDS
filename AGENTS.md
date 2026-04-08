# Repository Guidelines

## Project Structure & Module Organization

This repository is currently docs-first. `docs/PLANS.md` is the source of truth for architecture, package boundaries, and delivery milestones. `CLAUDE.md` defines the repository-wide language policy: all committed artifacts must be in English.

Implementation is planned as a `pnpm` monorepo. Follow the layout described in `docs/PLANS.md`: `packages/core` for domain logic, `packages/adapter-*` for infrastructure, `packages/cli` and `packages/server` for interfaces, `fixtures/vault` for sample Markdown data, and `docker/` for local Neo4j setup.

## Build, Test, and Development Commands

No build, lint, or test scripts are committed yet. Until the workspace is scaffolded, keep changes focused on documentation and planning artifacts.

Use these commands during review:

- `git status` to confirm the scope of your change.
- `git diff -- docs/PLANS.md` to inspect edits to the implementation plan.
- `git log --oneline` to match existing commit style.

When adding the first runnable workspace, standardize on `pnpm` and expose commands from the root `package.json`, for example `pnpm test` and `pnpm lint`.

## Coding Style & Naming Conventions

Write all repository content in English, including Markdown, code, comments, commit messages, and PR descriptions. Preserve the planned hexagonal architecture: business rules belong in `packages/core`, while file system, Neo4j, LLM, CLI, and HTTP concerns belong in adapters.

Prefer `kebab-case` for directories and package names, `camelCase` for variables and functions, and `PascalCase` for TypeScript types and classes. Keep comments brief and only where intent is not obvious.

## Testing Guidelines

Tests are not checked in yet, but the plan calls for `vitest` and `testcontainers` for Neo4j-backed integration coverage. Use `*.test.ts` for unit tests and keep golden Markdown fixtures under `fixtures/vault/`.

New code should cover parser behavior, document rewrite safety, and graph sync idempotence.

## Commit & Pull Request Guidelines

Follow the existing history: short imperative subjects such as `Add initial AGDS implementation plan and language policy`. Add a body when context or rationale is not obvious.

Unless the user explicitly requests a branch change, continue working on the current branch. Do not create a new branch by default.

PRs should describe scope, link the relevant issue or plan section, and include sample CLI or HTTP output when behavior changes. Call out any config, schema, or migration impact explicitly.

## Security & Configuration Tips

Do not commit secrets. The planned configuration reads credentials from environment variables such as `NEO4J_PASSWORD` and `AGDS_API_TOKEN`. Treat future config changes in `agds.config.ts` as security-sensitive and review defaults carefully.
