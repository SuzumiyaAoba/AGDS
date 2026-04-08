# 006 FS Document Store

> Status: Draft
> Goal: Implement the first real `DocumentStore`
> Depends on: `005-markdown-parser.md`

## Objective

Make AGDS able to enumerate and read a local Markdown vault through the
planned storage contract.

## Tasks

1. Implement `list`.
2. Implement `read`.
3. Implement `stat`.
4. Implement `resolveLinkTarget`.
5. Implement `formatLinkTarget`.
6. Add FS adapter conformance tests.

## Done When

- The FS adapter satisfies the read-path port contract.
- Path-based target resolution works for fixture documents.

## Out of Scope

- Neo4j integration
- Sync orchestration
