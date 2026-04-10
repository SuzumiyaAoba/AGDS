# 007 Neo4j Schema And Graph Store

> Status: Done
> Goal: Implement the first real `GraphStore`
> Depends on: `004-ports-and-shared-schemas.md`

## Objective

Create the Neo4j-side foundation needed by sync and read services.

## Tasks

1. Add local Neo4j + APOC development setup.
2. Implement schema init and migration runner.
3. Implement document upsert support.
4. Implement heading/tag upsert support.
5. Implement read-only query execution support.

## Done When

- `agds init` can create required schema objects.
- `agds doctor` can verify Neo4j + APOC readiness.
- The adapter can persist document-shaped graph state for tests.

## Out of Scope

- Sync reconciliation
- Resolve/fetch behavior
