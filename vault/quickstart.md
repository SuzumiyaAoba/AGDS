---
agds:
  id: quickstart
  tags: [agds, getting-started]
title: Quickstart
---

# Quickstart

Get AGDS running from scratch in five steps.

## Step 1 — Enter the dev shell

```sh
nix develop
```

The shell hook installs Node 20, pnpm, builds all packages, and starts
Neo4j 5 Community with APOC. When the prompt returns, `agds` is on your
`$PATH`.

## Step 2 — Initialize the vault

```sh
agds init
```

Creates `agds.config.json` in the current directory with defaults that
work inside `nix develop` (password: `agds-dev-password`).

Edit the file if needed — at minimum set `vault.root` to the directory
that holds your Markdown documents.

## Step 3 — Apply schema migrations

```sh
agds init   # run a second time
```

Connects to Neo4j, verifies APOC is available, and installs the graph
schema.

## Step 4 — Sync your documents

```sh
agds sync
```

Walks `vault.root`, parses every `.md` file, and upserts documents and
edges into the graph.

## Step 5 — Explore the graph

```sh
# Check the system is healthy
agds doctor

# List all documents
agds query "MATCH (d:Document) RETURN d.publicId, d.title"

# Find what links to a document
agds backlinks overview

# Find what a document links to
agds neighbors overview

# Fetch document content
agds fetch overview
```

Open the Neo4j browser at http://localhost:7474 (credentials:
`neo4j` / `agds-dev-password`) for a visual graph view.

## Related

- [[Overview|REFERENCES](overview.md)]
- [[CLI Reference|REFERENCES](cli-reference.md)]
- [[Vault|REFERENCES](vault.md)]
