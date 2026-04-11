# AGDS — Automated Graph Document System

AGDS manages a collection of Markdown documents as a knowledge graph stored in
Neo4j. An LLM can infer and propose relationships between documents, and you can
query the resulting graph with Cypher directly or through the CLI.

## Features

- **Knowledge graph from Markdown** — parse documents, extract links, headings,
  tags, and frontmatter into a Neo4j graph
- **Pluggable link types** — explicit links `[[text](target)]`, LLM-suggested
  links `[?[text](target)]`, and optional relationship types `[[text|TYPE](target)]`
- **Edge lifecycle** — `active` (confirmed), `pending` (suggestion), `rejected`
  (training signal)
- **Cypher queries** — run arbitrary Cypher against the graph from the CLI
- **Hexagonal architecture** — business logic in `@agds/core`, storage and graph
  backends are pluggable adapters

## Packages

| Package | Description |
|---|---|
| `@agds/core` | Pure domain logic: parsers, types, Zod schemas |
| `@agds/runtime` | Service composition — wires adapters together |
| `@agds/adapter-neo4j` | Neo4j graph store with migrations and Cypher queries |
| `@agds/adapter-store-fs` | Filesystem document store adapter |
| `@agds/cli` | `agds` CLI entry point |

## Requirements

- Node.js 20+
- pnpm 10+
- Neo4j 5 Community Edition with APOC Core plugin

## Getting Started

### Option A — Nix (recommended)

```sh
nix develop
```

This single command installs Node 20, pnpm, builds all packages, and starts a
local Neo4j instance with APOC. Once the prompt returns, `agds` is already on
your `$PATH` — skip straight to [Initialize a vault](#initialize-a-vault).

### Option B — Manual (without Nix)

```sh
# 1. Install dependencies
pnpm install

# 2. Start Neo4j
docker compose -f docker/docker-compose.yml up -d

# 3. Build all packages
pnpm build
```

### Initialize a vault

```sh
# Create config file
agds init

# Edit agds.config.json — set vault.root and neo4j.password, then run again
agds init

# Import documents into the graph
agds sync
```

## CLI Commands

| Command | Description |
|---|---|
| `agds init` | Initialize vault config and install Neo4j schema |
| `agds migrate` | Run pending schema migrations |
| `agds sync` | Sync vault documents into the graph |
| `agds verify` | Check document integrity and link validity |
| `agds resolve <link>` | Resolve a link target |
| `agds fetch <id>` | Fetch document content |
| `agds neighbors <id>` | List documents related to a document |
| `agds backlinks <id>` | Find documents that link to a document |
| `agds query <cypher>` | Execute a Cypher query |
| `agds doctor` | Run system diagnostics |

## Configuration

AGDS reads `agds.config.json` (or the path set by `AGDS_CONFIG`) at startup.
Sensitive values can be supplied via environment variables:

```jsonc
{
  "vault": {
    "root": "/path/to/your/notes",
    "extensions": [".md"],
    "exclude": ["node_modules", ".git"]
  },
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "changeme"   // or set AGDS_NEO4J_PASSWORD
  }
}
```

## Development

```sh
pnpm test          # Run all tests (no Neo4j required)
pnpm lint          # Type-check without emitting
pnpm build         # Build all packages

# Filter to a single package
pnpm --filter @agds/cli test
```

See [docs/development.md](docs/development.md) for a full development guide and
[docs/PLANS.md](docs/PLANS.md) for architecture decisions.

## License

MIT
