---
agds:
  id: link-syntax
  tags: [agds, concepts, links]
title: Link Syntax
---

# Link Syntax

AGDS extends standard Markdown link syntax to express typed, directional
relationships between documents.

## Explicit link

A confirmed relationship written by a human:

```markdown
[[display text](target)]
```

Example:

```markdown
[[Architecture](architecture.md)]
```

## Typed explicit link

An explicit link with a relationship type:

```markdown
[[display text|RELATIONSHIP_TYPE](target)]
```

Example:

```markdown
[[Neo4j Adapter|IMPLEMENTS](architecture.md)]
```

Relationship type names are free-form uppercase strings. Common conventions:

| Type | Meaning |
|---|---|
| `REFERENCES` | This document cites or mentions the target |
| `IMPLEMENTS` | This document implements a concept from the target |
| `PART_OF` | This document is a section or component of the target |
| `RELATED_TO` | General association |
| `DESCRIBES` | This document explains the target |

## LLM-suggested link

A relationship proposed by an LLM, pending human review:

```markdown
[?[display text](target)]
```

The `?` prefix marks the edge status as `pending` in the graph. Accept or
reject suggestions by editing the link:

- Remove the `?` → status becomes `active`
- Delete the link entirely → status becomes `rejected`

## Edge lifecycle

```
pending  →  active    (human confirms)
pending  →  rejected  (human rejects)
```

Rejected edges are kept in the graph as training signal for the LLM.

## Related

- [[Document Identity|RELATED_TO](document-identity.md)]
- [[Architecture|RELATED_TO](architecture.md)]
- [[Overview|PART_OF](overview.md)]
