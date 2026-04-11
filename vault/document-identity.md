---
agds:
  id: document-identity
  tags: [agds, concepts, internals]
title: Document Identity
---

# Document Identity

Every document in AGDS has two kinds of identifier.

## Internal ID

A 16-character hex string computed as:

```
SHA1(vaultId + ":" + storeKey) → first 16 hex digits
```

This ID is stable across renames as long as the content hash is unchanged,
which enables AGDS to detect when a file was moved rather than deleted and
re-created.

## Public ID

An optional human-readable identifier declared in frontmatter:

```yaml
---
id: my-document
---
```

Public IDs must be unique within a vault. They are used in link targets
and CLI commands:

```sh
agds fetch my-document
agds neighbors my-document
```

## Store key

The path of the file relative to `vault.root`, e.g. `notes/2024-01-01.md`.
Store keys are used internally and as a fallback reference form when no
public ID is set.

## Reference forms accepted by the CLI

| Form | Example |
|---|---|
| Public ID | `my-vault/my-document` |
| Store key | `notes/2024-01-01.md` |
| File path | `./vault/notes/2024-01-01.md` |
| Title | `My Document` |
| AGDS link token | `[[my-document]]` |

## Related

- [?[Rename detection](sync.md)] — how the sync service uses content hashes
- [[Link Syntax|RELATED_TO](link-syntax.md)]
- [[Overview|PART_OF](overview.md)]
