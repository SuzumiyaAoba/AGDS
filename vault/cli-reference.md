---
agds:
  id: cli-reference
  tags: [agds, cli, reference]
title: CLI Reference
---

# CLI Reference

All `agds` commands write newline-delimited JSON to stdout. Pass
`--config <path>` to point to a non-default config file.

## `agds init`

Initialize the vault config and apply Neo4j schema migrations.

**First run** (no `agds.config.json` present): creates the config file and
prints a hint.

**Subsequent runs**: connects to Neo4j, verifies APOC availability, and applies
all pending migrations.

```sh
agds init
# {"status":"ok","apocVersion":"5.26.0","applied":["001","002","003"]}
```

## `agds sync`

Walk `vault.root` and upsert all documents into the graph.

```sh
agds sync
# {"status":"ok","created":12,"updated":3,"deleted":0}
```

## `agds verify`

Report broken links and orphaned nodes. Exits with code `1` if issues found.

```sh
agds verify
# {"status":"issues_found","count":2,"issues":[...]}
```

## `agds resolve <ref>`

Look up a document by any supported [[reference form|REFERENCES](document-identity.md)].

```sh
agds resolve "[[overview]]"
agds resolve "overview"
agds resolve "vault/overview.md"
```

## `agds fetch <ref>`

Retrieve document content.

```sh
agds fetch overview                      # Markdown (default)
agds fetch overview --section internals  # specific heading
agds fetch overview --format text        # plain text
agds fetch overview --format json        # metadata + body
```

## `agds neighbors <ref>`

List documents reachable via outgoing edges.

```sh
agds neighbors overview
agds neighbors overview --depth 2
agds neighbors overview --type REFERENCES
agds neighbors overview --status pending
agds neighbors overview --status any
```

## `agds backlinks <ref>`

List documents that link to a given document.

```sh
agds backlinks overview
# {"status":"ok","count":3,"backlinks":[...]}
```

## `agds query <cypher>`

Run a read-only Cypher query.

```sh
agds query "MATCH (d:Document) RETURN d.publicId LIMIT 10"
```

## `agds migrate`

Apply pending Neo4j schema migrations (normally called by `agds init`).

```sh
agds migrate
```

## `agds doctor`

Check connectivity, APOC availability, and schema version.

```sh
agds doctor
# {"status":"ok","neo4j":{"connected":true,"apocVersion":"5.26.0"},"schemaVersion":3}
```

## Related

- [[Overview|PART_OF](overview.md)]
- [[Quickstart|RELATED_TO](quickstart.md)]
