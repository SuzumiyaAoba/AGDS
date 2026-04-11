---
agds:
  id: architecture
  tags: [agds, internals, architecture]
title: Architecture
---

# Architecture

AGDS follows a **hexagonal architecture**: business logic is isolated in the
core package, while storage and graph backends are pluggable adapters.

## Package structure

```
packages/
  core/              Pure domain logic — parsers, types, Zod schemas
  runtime/           Service composition — wires adapters together
  adapter-neo4j/     Neo4j graph store
  adapter-store-fs/  Filesystem document store
  cli/               agds CLI entry point
```

## Layers

### Core (`@agds/core`)

No I/O. Contains:

- Markdown parser (unified + remark)
- Document and link type definitions
- Zod schemas for runtime validation
- Port interfaces (contracts the adapters must implement)

### Adapters

| Package | Port | Backend |
|---|---|---|
| `@agds/adapter-store-fs` | `DocumentStore` | Local filesystem |
| `@agds/adapter-neo4j` | `GraphStore` | Neo4j 5 + APOC |

### Runtime (`@agds/runtime`)

`createAgds()` wires adapters into services:

- **SyncService** — walk vault, upsert documents and edges
- **VerifyService** — report broken links and orphaned nodes
- **ResolveService** — resolve link targets
- **FetchService** — retrieve document content by section
- **NavigationService** — backlinks and neighbor traversal
- **QueryService** — Cypher query execution

### CLI (`@agds/cli`)

Thin shell over the runtime. Each subcommand calls one service method and
writes newline-delimited JSON to stdout.

## Data flow — `agds sync`

```
vault.root
  └─ adapter-store-fs  →  list + read files
       └─ @agds/core   →  parse Markdown
            └─ SyncService  →  diff against graph state
                 └─ adapter-neo4j  →  upsert nodes & edges
```

## Related

- [[Core Package|DESCRIBES](core.md)]
- [[Neo4j Schema|DESCRIBES](neo4j-schema.md)]
- [[Overview|PART_OF](overview.md)]
