# 010 Resolve Service

> Status: Done
> Goal: Implement deterministic document resolution
> Depends on: `008-sync-service.md`

## Objective

Resolve user-facing references into concrete AGDS documents without
mutating graph state.

## Tasks

1. Implement the normalization ladder from `docs/PLANS.md`.
2. Support `DocumentRef`, `publicId`, internal `id`, store key, and path resolution.
3. Support heading-anchor resolution.
4. Add read-only resolution tests.

## Done When

- `resolve` works for the documented identifier forms.
- Lookup misses do not mutate the graph.

## Out of Scope

- Fetch formatting
- Cypher query execution
