# 011 Fetch Navigation And Query

> Status: Done
> Goal: Expose read-only content retrieval and graph navigation
> Depends on: `010-resolve-service.md`

## Objective

Make the resolved graph useful through fetch, neighbors, backlinks, and
read-only Cypher.

## Tasks

1. Implement `fetch`.
2. Implement section slicing by heading slug.
3. Implement `neighbors`.
4. Implement `backlinks`.
5. Implement read-only `query` behavior and write rejection tests.

## Done When

- `fetch --section` returns the correct section body.
- `neighbors` and `backlinks` work on fixture data.
- Read-only query mode rejects writes by default.

## Out of Scope

- CLI formatting
- HTTP transport
