# 004 Ports And Shared Schemas

> Status: Done
> Goal: Define adapter contracts and shared zod shapes
> Depends on: `003-core-domain-and-errors.md`

## Objective

Create the integration boundary between the core and future adapters.

## Tasks

1. Add port interfaces in `@agds/core`.
2. Add shared command/request/response schemas in `@agds/schema`.
3. Add in-memory fake implementations sufficient for service tests.

## Done When

- Core compiles without importing concrete adapters.
- In-memory fakes can be used by the next service-focused plans.

## Out of Scope

- Real FS behavior
- Real Neo4j behavior
