# 003 Core Domain And Errors

> Status: Draft
> Goal: Define stable core domain types and error codes
> Depends on: `002-package-skeletons.md`

## Objective

Lock down the domain model and deterministic error surface before
service implementation.

## Tasks

1. Define core types for documents, headings, tags, and edges.
2. Define identity-related types including `Document.id` and `Document.publicId`.
3. Define the initial `AgdsError` hierarchy and stable error codes.
4. Add unit tests for the error and type surface where useful.

## Done When

- `@agds/core` exports the types needed by planned services.
- Error codes referenced in the core slice have one canonical definition.

## Out of Scope

- Port interfaces
- Parser behavior
