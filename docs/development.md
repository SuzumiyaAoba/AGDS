# Development Guide

## Prerequisites

Choose **one** of the following environment setups.

### Option A — Nix (recommended, single command)

[Nix](https://nixos.org/download) must be installed with flakes enabled.

```sh
nix develop
```

This one command:

1. Installs Node 20 and pnpm into an isolated shell.
2. Runs `pnpm install --frozen-lockfile`.
3. Compiles all TypeScript packages (`pnpm build`).
4. Puts `agds` on your `$PATH`.
5. Downloads the APOC Core plugin (hash-verified by Nix).
6. Starts a Neo4j 5 Community instance with APOC enabled.

You are ready to work. Skip the manual steps below.

Neo4j state is stored under `.neo4j/` in the project root (gitignored).
Stop the database at any time with:

```sh
neo4j stop
```

| Service | URL | Default credentials |
|---|---|---|
| Neo4j Browser | http://localhost:7474 | neo4j / agds-dev-password |
| Bolt | bolt://localhost:7687 | — |

#### Enable flakes (first-time Nix users)

Add the following to `~/.config/nix/nix.conf` (create it if absent):

```
experimental-features = nix-flakes nix-command
```

### Option B — Manual

| Tool | Required version |
|---|---|
| Node.js | ≥ 20 |
| pnpm | 10.x (matches `packageManager` in `package.json`) |
| Docker Engine | any recent |

```sh
pnpm install
pnpm build
```

Then start Neo4j with the provided Compose file:

```sh
docker compose -f docker/docker-compose.yml up -d
```

Wait for the health check to pass:

```sh
docker compose -f docker/docker-compose.yml ps   # STATUS should be "healthy"
```

---

## First-time setup

```sh
# 1. Create a config file in your vault directory.
agds init

# 2. Edit the generated agds.config.json:
#    - Set vault.root to your Markdown directory.
#    - Set neo4j.password (or export AGDS_NEO4J_PASSWORD).

# 3. Apply schema migrations and verify connectivity.
agds init   # run a second time once the config is filled in

# 4. Import your documents.
agds sync
```

---

## Common tasks

```sh
# Run all tests (no Neo4j required)
pnpm test

# Type-check without emitting files
pnpm lint

# Build all packages
pnpm build

# Run only the CLI tests
pnpm --filter @agds/cli test

# Watch mode during development
pnpm --filter @agds/cli exec vitest
```

---

## Reproducible builds with Nix

`nix build` produces a standalone binary at `result/bin/agds` without
requiring pnpm or Node to be installed on the host.

```sh
# First run — will fail with a hash mismatch; copy the correct hash
# from the error output and paste it into the `hash` field of
# `pnpmDeps` in flake.nix, then run again.
nix build

# After the hash is set
nix run -- sync
```

`nix run` is equivalent to running `agds` directly once the build succeeds.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGDS_NEO4J_PASSWORD` | — | Overrides `neo4j.password` in the config file |

---

## Project layout

```
packages/
  core/              Domain logic — parsers, types, no I/O
  schema/            Shared Zod schemas
  adapter-neo4j/     Neo4j graph adapter + migrations
  adapter-store-fs/  Filesystem document store adapter
  runtime/           Service composition (createAgds)
  cli/               CLI entry point (agds binary)
docker/
  docker-compose.yml Local Neo4j + APOC (Option B / manual setup)
docs/
  PLANS.md           Architecture reference
  development.md     This file
fixtures/
  vault/             Sample Markdown documents for tests
```
