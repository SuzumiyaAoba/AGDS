---
agds:
  id: neo4j-schema
  tags: [agds, internals, neo4j]
title: Neo4j Schema
---

# Neo4j Schema

AGDS stores the knowledge graph in Neo4j using the following node and
relationship types.

## Node labels

| Label | Description |
|---|---|
| `Document` | One Markdown file |
| `Heading` | A heading within a document |
| `Tag` | A tag declared in frontmatter |
| `RelationType` | A named edge type (e.g. `REFERENCES`) |
| `MissingTarget` | Placeholder for a link whose target was not found |
| `AgdsMeta` | Singleton — stores schema version |
| `AgdsLock` | Distributed lock for concurrent sync |

## Document node properties

| Property | Type | Description |
|---|---|---|
| `id` | String | Internal 16-hex ID |
| `publicId` | String? | Human-readable ID from frontmatter |
| `storeKey` | String | Path relative to vault root |
| `title` | String? | First H1 heading or frontmatter title |
| `contentHash` | String | SHA1 of file content (rename detection) |
| `versionToken` | String | Store-provided change token |
| `syncedAt` | DateTime | When this document was last synced |

## Relationship types

| Type | From → To | Description |
|---|---|---|
| `HAS_HEADING` | Document → Heading | Document contains a heading |
| `HAS_TAG` | Document → Tag | Document declares a tag |
| `LINKS_TO` | Document → Document\|MissingTarget | An in-document link |
| `TYPED_AS` | LINKS_TO edge → RelationType | Edge carries a named type |

## Edge properties (on `LINKS_TO`)

| Property | Values | Description |
|---|---|---|
| `source` | `explicit`, `llm` | Who created the edge |
| `status` | `active`, `pending`, `rejected` | Lifecycle state |
| `displayText` | String | The link's display label |

## Migrations

Schema changes are applied by `agds init` (or `agds migrate`). Migration
scripts live in `packages/adapter-neo4j/migrations/` and are numbered
sequentially.

## Related

- [[Architecture|PART_OF](architecture.md)]
- [?[Cypher query examples](query-examples.md)]
