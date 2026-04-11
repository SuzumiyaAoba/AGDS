---
agds:
  id: vault
  tags: [agds, concepts]
title: Vault
---

# Vault

A **vault** is a directory that contains the Markdown documents you want to
manage as a knowledge graph.

## Configuration

The vault is configured in `agds.config.json`:

```json
{
  "vaultId": "my-vault",
  "vault": {
    "root": "./vault",
    "extensions": [".md"],
    "exclude": ["node_modules", ".git"]
  }
}
```

| Field | Description |
|---|---|
| `vaultId` | Unique identifier for the vault (used as namespace in the graph) |
| `vault.root` | Path to the document directory (relative or absolute) |
| `vault.extensions` | File extensions to include (default: `[".md"]`) |
| `vault.exclude` | Directory or file patterns to ignore |

## Syncing

Run `agds sync` to import or update all documents from the vault into Neo4j.
AGDS walks `vault.root`, parses each matching file, and upserts nodes and
edges into the graph.

```sh
agds sync
# {"status":"ok","created":12,"updated":3,"deleted":0}
```

`agds sync` is idempotent — run it as often as you like.

## Related

- [[Overview|PART_OF](overview.md)]
- [[Document Identity|RELATED_TO](document-identity.md)]
