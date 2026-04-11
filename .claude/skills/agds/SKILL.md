---
name: agds
description: Use this skill when the user asks about AGDS commands, wants to query the knowledge graph, fetch documents, explore relationships between documents, or sync vault contents. Triggers on questions like "show documents linked from X", "fetch the content of X", "what links to X", or "run a Cypher query".
---

# AGDS — Automated Graph Document System

AGDS manages a Markdown vault as a knowledge graph stored in Neo4j.
Use the `agds` CLI to sync documents, traverse links, fetch content, and run Cypher queries.

## Prerequisites

- Run inside `nix develop` (starts Neo4j automatically), or start Neo4j manually.
- `agds.config.json` must exist. If not, run `agds init` then `agds init` again.
- Documents must be synced: `agds sync`.

## Commands

### Setup

```sh
agds init          # Create agds.config.json (default password: agds-dev-password)
agds init          # Second run: connect to Neo4j and apply schema migrations
agds sync          # Import/update all documents from vault.root into the graph
agds doctor        # Check connectivity, APOC version, schema version
agds migrate       # Apply pending schema migrations (normally called by init)
```

### Fetch document content

```sh
agds fetch <ref>                       # Markdown (default)
agds fetch <ref> --section <slug>      # Specific heading section only
agds fetch <ref> --format text         # Plain text (no Markdown syntax)
agds fetch <ref> --format json         # JSON: {document, body, format}
agds fetch <ref> --format toon         # TOON (compact, LLM-optimized)
```

`<ref>` accepts: publicId (`overview`), storeKey (`overview.md`), file path, title, or AGDS link token (`[[overview]]`).

### Explore relationships

```sh
agds neighbors <ref>                   # Documents linked from ref (depth 1, active edges)
agds neighbors <ref> --depth 2         # Two hops
agds neighbors <ref> --type REFERENCES # Filter by relationship type
agds neighbors <ref> --status pending  # Include LLM-suggested (pending) edges
agds neighbors <ref> --status any      # All edges regardless of status
agds neighbors <ref> --format toon     # Compact tabular output for LLMs

agds backlinks <ref>                   # Documents that link to ref
agds backlinks <ref> --format toon     # Compact tabular output for LLMs
```

### Resolve and verify

```sh
agds resolve <ref>                     # Resolve a reference and return document metadata
agds verify                            # Report broken links and orphaned nodes (exit 1 if issues)
```

### Query

```sh
agds query "<cypher>"                  # Run a read-only Cypher query
agds query --format toon "<cypher>"    # TOON tabular output
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Programmatic use, piping to other tools |
| `toon` | LLM prompts — ~40% fewer tokens than JSON, tabular arrays |
| `md`   | Human reading, fetch only |
| `text` | Plain text, fetch only |

All commands default to `json` except `fetch` which defaults to `md`.

## TOON output examples

```sh
agds query --format toon "MATCH (d:Document) RETURN d.publicId, d.title"
# status: ok
# count: 8
# rows[8]{d.publicId,d.title}:
#   overview,AGDS Overview
#   architecture,Architecture
#   ...

agds neighbors overview --format toon
# status: ok
# count: 5
# neighbors[5]{publicId,title,storeKey,edgeType,edgeStatus,depth}:
#   architecture,Architecture,architecture.md,DESCRIBES,active,1
#   link-syntax,Link Syntax,link-syntax.md,DESCRIBES,active,1
#   ...
```

## Document reference forms

| Form | Example |
|------|---------|
| publicId | `overview` |
| storeKey | `overview.md` |
| File path | `./vault/overview.md` |
| Title | `AGDS Overview` |
| AGDS link token | `[[overview]]` |

## Useful Cypher queries

```sh
# List all documents
agds query "MATCH (d:Document) RETURN d.publicId, d.title"

# Documents with a specific tag
agds query "MATCH (d:Document)-[:HAS_TAG]->(t:Tag {name:'internals'}) RETURN d.publicId, d.title"

# All pending (LLM-suggested) edges
agds query "MATCH (a:Document)-[r:LINKS_TO {status:'pending'}]->(b) RETURN a.publicId, b.publicId, r.type"

# Documents with no outgoing links
agds query "MATCH (d:Document) WHERE NOT (d)-[:LINKS_TO]->() RETURN d.publicId, d.title"

# Most linked-to documents
agds query "MATCH ()-[:LINKS_TO]->(d:Document) RETURN d.publicId, count(*) AS inDegree ORDER BY inDegree DESC LIMIT 10"
```

## Link syntax (in Markdown documents)

```markdown
[[display text](target)]                  # Explicit link
[[display text|RELATIONSHIP_TYPE](target)] # Typed explicit link
[?[display text](target)]                 # LLM-suggested (pending) link
```

Edge status lifecycle: `pending` → `active` (remove `?`) or `rejected` (delete link).

## Workflow: provide document context to an LLM

```sh
# Fetch a document's content in TOON format
agds fetch overview --format toon

# Fetch a document and its neighbors for richer context
agds fetch overview --format toon
agds neighbors overview --format toon

# Traverse from a starting point
agds neighbors overview --depth 2 --format toon
```

## Configuration

`agds.config.json` (created by `agds init`):

```json
{
  "vaultId": "my-vault",
  "vault": { "root": "./vault" },
  "neo4j": {
    "url": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "agds-dev-password"
  }
}
```

Override Neo4j password via `AGDS_NEO4J_PASSWORD` environment variable.
Override config path via `AGDS_CONFIG` or `--config <path>` flag.
