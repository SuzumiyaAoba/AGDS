# 008 Sync Service

> Status: Done
> Goal: Sync parsed documents into Neo4j deterministically
> Depends on: `005-markdown-parser.md`, `006-fs-document-store.md`, `007-neo4j-schema-and-graph-store.md`

## Objective

Implement the first end-to-end mutation path for AGDS.

## Tasks

1. Implement shared `scope:"write"` lock handling.
2. Implement full document sync.
3. Implement edge reconciliation.
4. Implement broken-link and missing-target behavior.
5. Add sync idempotency tests.

## Done When

- `sync ∘ sync = sync`.
- Fixture-vault sync produces stable graph state.
- Broken links are represented in the graph.

## Out of Scope

- Incremental optimization beyond what is strictly needed
- Verify reporting
