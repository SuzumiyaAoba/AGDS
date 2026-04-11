# Quickstart — after `nix develop`

> **Prerequisites:** [Nix](https://nixos.org/download) with flakes enabled.
> Add `experimental-features = nix-flakes nix-command` to `~/.config/nix/nix.conf`
> if you have not already done so.

---

## 1. Enter the dev shell

```sh
nix develop
```

The shell hook automatically:

1. Installs Node 20 and pnpm into an isolated shell.
2. Runs `pnpm install --frozen-lockfile`.
3. Compiles all TypeScript packages (`pnpm build`).
4. Puts `agds` on your `$PATH`.
5. Downloads the APOC Core plugin (hash-verified by Nix).
6. Starts a Neo4j 5 Community instance with APOC enabled.

When the prompt returns you will see:

```
AGDS dev environment ready.
  agds --help   show CLI commands
  pnpm test     run all tests
  neo4j stop    stop Neo4j

Neo4j Browser : http://localhost:7474
Credentials   : neo4j / agds-dev-password
```

Neo4j state is stored under `.neo4j/` in the project root (gitignored).

---

## 2. Set up a vault (first time only)

A *vault* is a directory that contains the Markdown documents you want to
manage as a knowledge graph.

### 2a. Generate the config file

```sh
cd /path/to/your/vault   # or stay in the repo root for testing
agds init
```

This creates `agds.config.json` in the current directory:

```json
{
  "vaultId": "my-vault",
  "vault": {
    "root": "./vault"
  },
  "neo4j": {
    "url": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "your-neo4j-password"
  }
}
```

### 2b. Edit the config

| Field | What to set |
|---|---|
| `vaultId` | A unique identifier for this vault (used as a namespace in the graph). |
| `vault.root` | Path to the directory that holds your `.md` files (relative to the config file or absolute). |
| `neo4j.password` | `agds-dev-password` for the Nix dev shell. Can also be set via `AGDS_NEO4J_PASSWORD`. |

### 2c. Apply schema migrations

Run `agds init` a second time once the config is filled in:

```sh
agds init
```

This connects to Neo4j, verifies APOC is available, and applies all pending
schema migrations.

---

## 3. Import your documents

```sh
agds sync
```

Walks `vault.root`, parses every `.md` file, and upserts documents and edges
into the graph.  Output is a JSON line:

```json
{"status":"ok","created":12,"updated":3,"deleted":0}
```

Run `agds sync` again at any time to pick up changes.

---

## 4. CLI command reference

All commands accept an optional `--config <path>` flag that points to a
non-default config file.  All output is newline-delimited JSON.

### `agds doctor`

Check connectivity, APOC availability, and the current schema version.

```sh
agds doctor
```

```json
{
  "status": "ok",
  "config": { "vaultId": "my-vault", "vaultRoot": "./vault", "neo4jUrl": "bolt://localhost:7687" },
  "neo4j": { "connected": true, "apocVersion": "5.26.0" },
  "schemaVersion": 3
}
```

Run this whenever you are unsure whether the environment is healthy.

---

### `agds sync`

Import or update all documents from the vault into the graph.

```sh
agds sync
```

---

### `agds verify`

Report broken wiki-links and orphaned graph nodes.  Exits with code `1` when
issues are found.

```sh
agds verify
```

```json
{ "status": "issues_found", "count": 2, "issues": [...] }
```

---

### `agds resolve <ref>`

Look up a document by any supported reference form and return its metadata.

```sh
agds resolve "my-note"
agds resolve "[[my-note]]"
agds resolve "vault/my-note.md"
```

Supported reference forms:

| Form | Example |
|---|---|
| `publicId` | `my-vault/my-note` |
| `storeKey` | `vault/my-note.md` |
| File path | `./vault/my-note.md` |
| Title | `My Note` |
| AGDS link token | `[[my-note]]` |

---

### `agds fetch <ref>`

Retrieve the full body (or a section) of a document.

```sh
# Default: Markdown output
agds fetch "my-note"

# Slice to a specific heading
agds fetch "my-note" --section "introduction"

# Plain text output
agds fetch "my-note" --format text

# JSON output (metadata + body)
agds fetch "my-note" --format json
```

`--format` accepts `md` (default), `text`, or `json`.

---

### `agds neighbors <ref>`

List documents reachable from a given document via outgoing edges.

```sh
# Direct neighbors (depth 1, active edges only)
agds neighbors "my-note"

# Two hops away
agds neighbors "my-note" --depth 2

# Filter by relationship type
agds neighbors "my-note" --type REFERENCES

# Include pending edges
agds neighbors "my-note" --status pending

# All edges regardless of status
agds neighbors "my-note" --status any
```

`--status` accepts `active` (default), `pending`, or `any`.

---

### `agds backlinks <ref>`

List all documents that link to a given document.

```sh
agds backlinks "my-note"
```

```json
{ "status": "ok", "count": 3, "backlinks": [...] }
```

---

### `agds query <cypher>`

Run a read-only Cypher query directly against the Neo4j graph.

```sh
agds query "MATCH (d:Document) RETURN d.publicId LIMIT 10"
```

```json
{ "status": "ok", "count": 10, "rows": [...] }
```

Useful for ad-hoc exploration and debugging.

---

### `agds migrate`

Apply any pending Neo4j schema migrations without going through the full
`init` flow.  Normally called automatically by `agds init`.

```sh
agds migrate
```

---

## 5. Neo4j management

| Task | Command |
|---|---|
| Open the graph browser | Visit http://localhost:7474 (neo4j / agds-dev-password) |
| Stop Neo4j | `neo4j stop` |
| Start Neo4j | `neo4j start` |
| Check status | `neo4j status` |

The Bolt endpoint for direct driver access is `bolt://localhost:7687`.

---

## 6. Development tasks

```sh
# Run all tests (no Neo4j required)
pnpm test

# Type-check without emitting
pnpm lint

# Build all packages
pnpm build

# Run only the CLI tests
pnpm --filter @agds/cli test

# Watch mode for a package
pnpm --filter @agds/cli exec vitest
```
