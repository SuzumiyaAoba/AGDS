# 005 Markdown Parser

> Status: Draft
> Goal: Parse AGDS Markdown syntax deterministically
> Depends on: `004-ports-and-shared-schemas.md`

## Objective

Implement parsing for frontmatter, headings, explicit links, and
suggestion tokens.

## Tasks

1. Add the Markdown parsing pipeline.
2. Parse frontmatter and preserve non-AGDS fields.
3. Parse headings and heading slugs.
4. Parse `[[...]]` and `[?[...]]` tokens.
5. Implement `occurrenceKey` generation.
6. Add golden tests and stability tests.

## Done When

- The parser extracts all syntax required by the core slice.
- `occurrenceKey` stability tests pass.

## Out of Scope

- Review UX
- Document rewrite workflows
