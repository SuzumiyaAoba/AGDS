# 009 Verify Service

> Status: Draft
> Goal: Report integrity issues after sync
> Depends on: `008-sync-service.md`

## Objective

Expose a dedicated integrity-checking service for the first CLI slice.

## Tasks

1. Implement broken-link reporting.
2. Implement orphaned-record reporting for the core slice.
3. Add verification-focused tests against the fixture vault.

## Done When

- `verify` reports broken links from fixtures.
- Verification results are deterministic for unchanged graph state.

## Out of Scope

- LLM-specific validation
- Review-specific validation
