# AGDS Implementation Plan (Automated Graph Document System)

> **Status**: Draft &nbsp;•&nbsp; **Last updated**: 2026-04-08 &nbsp;•&nbsp; **Owner**: TBD

## Table of Contents

1. [Overview](#1-overview)
2. [In-document Link Syntax](#2-in-document-link-syntax)
3. [Graph Schema (Neo4j)](#3-graph-schema-neo4j)
4. [Architecture](#4-architecture)
5. [CLI Specification](#5-cli-specification)
6. [Technology Selection](#6-technology-selection)
7. [Data Flow](#7-data-flow)
8. [HTTP API](#8-http-api)
9. [Configuration](#9-configuration)
10. [Security & Safety](#10-security--safety)
11. [Performance & Cost](#11-performance--cost)
12. [Observability & Error Model](#12-observability--error-model)
13. [Testing Strategy](#13-testing-strategy)
14. [Directory Layout](#14-directory-layout)
15. [Milestones](#15-milestones)
16. [MCP Tool Surface](#16-mcp-tool-surface)
17. [Risk Register](#17-risk-register)
18. [Release & Versioning](#18-release--versioning)
19. [Internationalization Policy](#19-internationalization-policy)
20. [Open Questions](#20-open-questions)

---

## 1. Overview

AGDS manages a collection of Markdown documents as a graph in Neo4j. An LLM
automatically extracts, updates, and organizes relationships between
documents. Users interact through a CLI; the same surface is exposed over
HTTP and (later) MCP.

### 1.1 Goals

- Unify scattered Markdown documents as a single knowledge graph.
- Let an LLM infer and propose relationships between documents with
  open-ended, semantically meaningful edge types.
- Offer flexible Cypher querying to both humans and LLMs.
- Let the LLM traverse links autonomously by resolving and fetching
  linked documents from within the tool.
- Keep the core logic free of any I/O assumption: storage and interface
  are pluggable.

### 1.2 Scope

- Manages Markdown documents sourced from a pluggable `DocumentStore`.
  The filesystem is the default adapter; RDBMS, document databases,
  object storage, and Git providers are anticipated future adapters.
- Single-user / single-project (no multi-tenant support).
- No automatic watcher; the graph is refreshed via an explicit `sync`
  command. Users MAY wire `sync` into their own pre-commit hook or CI.

### 1.3 Glossary

- **Vault** — a logical collection of Markdown documents managed by AGDS.
  A vault is *backed by* a `DocumentStore` and need not correspond to a
  filesystem directory.
- **DocumentRef** — a store-defined, opaque identity for one document.
  For the FS adapter it carries a relative path; for an RDBMS adapter it
  may carry a primary key. The core treats it as opaque.
- **Explicit link** — a link confirmed by the user: `[[xxx](yyy.md)]`.
- **Suggestion** — an LLM-proposed link: `[?[xxx](yyy.md)]`.
- **Edge status** — `active` (confirmed), `pending` (suggestion awaiting
  review), `rejected` (kept as a training signal).

---

## 2. In-document Link Syntax

AGDS extends ordinary Markdown with two link forms. Both may optionally carry
an explicit relationship type after a pipe.

| Syntax | Meaning | Resulting edge |
|--------|---------|----------------|
| `[[xxx](yyy.md)]` | Explicit link | `source:"explicit"`, `status:"active"` |
| `[[xxx\|TYPE](yyy.md)]` | Explicit link with custom type | same, edge type = `TYPE` |
| `[?[xxx](yyy.md)]` | LLM suggestion | `source:"llm"`, `status:"pending"` |
| `[?[xxx\|TYPE](yyy.md)]` | LLM suggestion with proposed type | same, with the LLM's proposed type |

Rules:

- `xxx` is anchor text; `yyy.md` is a vault-resolvable reference (a path
  on the FS adapter, or any string the active store's `LinkResolver`
  understands) and MAY include a `#heading` anchor.
- The parser operates on the Markdown AST (remark/mdast) using a custom
  micromark extension, so the syntax survives formatters and does not
  collide with standard Markdown links.
- When a suggestion is accepted, `[?[...]]` is rewritten in place to
  `[[...]]` and the edge's `status` flips from `pending` to `active`.
- Rejection removes the `[?[...]]` token from the document; the edge is
  kept in the graph with `status:"rejected"` for learning.
- Default type when none is annotated: `LINKS_TO` for explicit links.
  For suggestions, the LLM picks a type; if it omits one the configured
  `suggest.defaultType` is used (default `RELATED_TO`).

### 2.1 Frontmatter Contract & Managed Sections

AGDS reads and writes a reserved `agds:` frontmatter namespace. All other
fields are passed through untouched.

| Field | Meaning |
|-------|---------|
| `agds.id` | Stable id override (otherwise derived) |
| `agds.tags` | Tags promoted to `(:Tag)` nodes |
| `agds.summary` | LLM-managed summary; written by `summarize` |
| `agds.doNotSuggest` | If `true`, exclude this document from `suggest` |
| `agds.frozen` | If `true`, refuse any AGDS-side rewrite |

Suggestion writeback uses **fence markers** so the rewriter can locate the
managed region without ever touching surrounding prose:

```markdown
<!-- agds:suggested-links start -->
- [?[Anchor text|TYPE](target.md)]
<!-- agds:suggested-links end -->
```

The rewriter touches only bytes between the markers. If the markers are
missing it inserts them at the end of the document. Collisions (e.g. the
markers exist but contain hand-written content) are reported as errors,
never overwritten silently.

---

## 3. Graph Schema (Neo4j)

### 3.1 Nodes

- `(:Document {id, vaultId, storeId, storeKey, path?, title, hash, bytes, storeVersion, updatedAt, summary, archived, schemaVersion})`
  - `id` — stable identifier: `sha1(vaultId + ":" + storeKey)`, truncated
    to 16 hex chars. Independent of any filesystem path.
  - `vaultId` — id of the logical vault this document belongs to.
  - `storeId` — id of the `DocumentStore` adapter that owns the document.
  - `storeKey` — opaque key the store uses to address this document.
  - `path` — *optional* presentation hint populated by adapters that have
    a natural human-readable path (FS, Git). Never used as identity.
  - `hash` — SHA-256 of the normalized body (frontmatter stripped).
  - `storeVersion` — store-supplied version token (mtime for FS, ETag for
    object stores, row version for RDBMS, commit SHA for Git). Used as a
    cheap "did this change?" probe before reading the body.
  - `summary` — optional LLM-generated summary.
  - `archived` — set to `true` instead of deleting when a document
    disappears, so historical edges survive.
- `(:Heading {id, docId, level, text, slug, order})` — per-document
  sections, enabling anchor resolution and section-scoped fetches.
- `(:Tag {name})` — extracted from frontmatter or headings.
- `(:Concept {name, embedding})` — optional LLM-extracted concepts.
- `(:RelationType {name, description, canonical, createdBy, createdAt})` —
  registry of known semantic edge types (see §3.3).
- `(:MissingTarget {ref})` — placeholder for unresolved link targets.
- `(:AgdsMeta {key, value})` — singleton-style records (e.g. the current
  graph schema version, last successful sync time).
- `(:AgdsLock {scope, holder, acquiredAt, expiresAt})` — advisory locks
  for long-running commands (see §11).

#### 3.1.1 Identity & Rename Detection

- If the active store provides a stable key (RDBMS PK, object key, Git
  blob path), AGDS uses that key as `storeKey` and identity is fixed for
  the lifetime of the document. Renames are free.
- If the store does **not** provide a stable key (e.g. raw FS), AGDS
  falls back to a content-hash heuristic: when `storeKey` changes but
  `hash` matches an existing document, the existing node is updated in
  place. This is the only case in which hash-based rename detection runs.

### 3.2 Relationships

Relationship **types are open-ended**: the LLM is free to mint new predicate
labels (e.g. `DEPENDS_ON`, `CONTRADICTS`, `ELABORATES`, `IMPLEMENTS`,
`SUPERSEDES`) whenever a more specific description fits better than a
generic link. Only a small set of structural relationships is fixed by the
system; everything else is dynamic and discoverable via
`db.relationshipTypes()` and the `(:RelationType)` registry.

Structural (system-managed) types:

- `(:Document)-[:HAS_HEADING]->(:Heading)`
- `(:Document)-[:HAS_TAG]->(:Tag)`
- `(:Document)-[:MENTIONS {score}]->(:Concept)`
- `(:Document)-[:BROKEN_LINK {anchor, reason}]->(:MissingTarget)`

Semantic (user- and LLM-managed) types — every edge carries a common
property envelope:

```text
(:Document)-[:<TYPE> {
  source,       // "explicit" | "llm" | "user"
  status,       // "active" | "pending" | "rejected"
  confidence,   // 0..1, present for LLM-generated edges
  rationale,    // short natural-language justification (LLM edges)
  anchor,       // optional "#heading" target anchor
  createdAt,
  updatedAt,
  model         // LLM model id, when applicable
}]->(:Document)
```

Because Cypher cannot parameterize relationship type names, all dynamic
edge writes go through `apoc.create.relationship(a, $type, $props, b)`.
The APOC Core plugin is therefore a hard requirement.

### 3.3 Relationship Type Registry

- Every time a new type is introduced (by the LLM or a user annotation),
  a `(:RelationType {name})` node is upserted with a description and
  provenance.
- A `(:RelationType)-[:ALIAS_OF]->(:RelationType)` edge records synonyms.
  A canonicalization pass (LLM-assisted, run via `agds types normalize`)
  merges aliases into a single canonical form to prevent type explosion.
- `agds types` and `agds types describe <name>` expose the registry.

### 3.4 Constraints & Indexes

```cypher
CREATE CONSTRAINT doc_id       IF NOT EXISTS FOR (d:Document)     REQUIRE d.id   IS UNIQUE;
CREATE CONSTRAINT doc_storekey IF NOT EXISTS FOR (d:Document)     REQUIRE (d.vaultId, d.storeKey) IS UNIQUE;
CREATE CONSTRAINT heading_id   IF NOT EXISTS FOR (h:Heading)      REQUIRE h.id   IS UNIQUE;
CREATE CONSTRAINT tag_name     IF NOT EXISTS FOR (t:Tag)          REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT reltype_name IF NOT EXISTS FOR (r:RelationType) REQUIRE r.name IS UNIQUE;
CREATE CONSTRAINT meta_key     IF NOT EXISTS FOR (m:AgdsMeta)     REQUIRE m.key  IS UNIQUE;
CREATE INDEX      doc_title    IF NOT EXISTS FOR (d:Document)     ON (d.title);
CREATE INDEX      doc_path     IF NOT EXISTS FOR (d:Document)     ON (d.path);
```

A vector index on `Concept.embedding` (and optionally `Document.embedding`)
is gated on `embeddings.provider` being configured.

### 3.5 Graph Schema Versioning & Migrations

- `(:AgdsMeta {key:"schemaVersion", value:<int>})` records the current
  schema version. `init` writes the initial value.
- Numbered migrations live under
  `packages/adapter-neo4j/migrations/<NNNN>-<slug>.cypher`. Each migration
  is wrapped in a transaction and bumps `schemaVersion` on success.
- `agds migrate` applies pending migrations in order; idempotent.
- `agds doctor` reports the current and target schema versions and warns
  when migrations are pending.

---

## 4. Architecture

AGDS follows a **hexagonal (ports-and-adapters)** layout. The core is a
pure TypeScript library with **no knowledge of any interface** (CLI, HTTP,
MCP) and no knowledge of any concrete I/O backend. Every outside concern —
the document store, Neo4j, the LLM provider, the clock, the logger — is an
injected port. Interfaces are thin adapters that translate
transport-specific input into calls on the core API.

```text
+-----------+  +-----------+  +-----------+
|    CLI    |  |  HTTP API |  |    MCP    |   <- interface adapters
|  (citty)  |  |  (hono)   |  | (M7, opt) |      (thin, no business logic)
+-----+-----+  +-----+-----+  +-----+-----+
      \              |              /
       \             v             /
        +---------------------------+
        |   @agds/core (pure lib)   |          <- application services
        |  SyncService              |             operating on domain
        |  SuggestService           |             entities via ports
        |  QueryService             |
        |  ResolveService / Fetch   |
        |  ReviewService            |
        |  RelationTypeService      |
        +-------------+-------------+
                      |
         +------------+------------+
         |  Ports (interfaces)     |
         |  GraphStore             |
         |  DocumentStore          |
         |  LlmClient   Cache      |
         |  Clock       Logger     |
         +------------+------------+
                      |
       +--------------+--------------+
       |              |              |
       v              v              v
  Neo4jGraphStore  FsDocumentStore   AnthropicLlmClient   <- infrastructure
  (neo4j-driver)   (fs/remark)       (@anthropic-ai/sdk)
                   ↑ swappable: PostgresDocumentStore,
                     S3DocumentStore, GitDocumentStore, …
```

Layering rules:

- **`@agds/core` never imports** `neo4j-driver`, `node:fs`,
  `@anthropic-ai/sdk`, `citty`, `hono`, or any transport/infrastructure
  package. It only depends on its own ports and `zod`.
- **Interface adapters** (`@agds/cli`, `@agds/server`) depend on
  `@agds/core` and on the infrastructure adapters they wire up. They
  contain no domain logic.
- **Infrastructure adapters** (`@agds/adapter-neo4j`, `@agds/adapter-store-fs`,
  `@agds/adapter-anthropic`) implement ports from `@agds/core`. They are
  interchangeable.
- A single **composition root** (`@agds/runtime`) wires adapters to ports
  and returns a ready-to-use `AgdsCore` instance. CLI, HTTP server, and
  MCP all call this composition root with a config object.

### 4.1 Core Services (interface-agnostic)

Each service is a class/function in `@agds/core` that takes its ports via
constructor injection and exposes a typed method surface. Services know
nothing about JSON, HTTP status codes, or terminal output — they take
validated input objects and return domain values (or throw typed
`AgdsError`s).

1. **Parser** — Markdown → mdast, extracts frontmatter, headings,
   `[[...]]`, `[?[...]]`, and `TYPE` annotations via a micromark extension.
2. **SyncService** — orchestrates hash-based incremental sync using
   `DocumentStore` + `GraphStore` ports.
3. **LinkResolver** — resolves a link target (DocumentRef, `#anchor`,
   id, or title) via `GraphStore` and `DocumentStore`.
4. **DocumentFetcher** — returns full body, a section sliced by heading,
   or an LLM-generated excerpt.
5. **SuggestService / SummarizeService** — call `LlmClient`, validate
   output with zod, and write through `GraphStore` / `DocumentStore`.
   Batching, rate-limiting, and cache lookups happen behind the
   `LlmClient` and `Cache` ports.
6. **LinkRewriter** — applies accept/reject decisions to documents and
   graph (write document, then promote edge, with rollback on failure).
7. **QueryService** — executes Cypher through `GraphStore` with a
   read-only default and an allowlist for writes.
8. **RelationTypeService** — tracks dynamic relationship types and
   aliases.
9. **ReviewService** — enumerates pending edges and applies decisions;
   the *interaction* (TUI prompts, HTTP long-poll, etc.) lives in the
   adapter, not here.
10. **VerifyService** — graph integrity checks (broken links, orphan
    documents, unknown types, suspicious cycles in hierarchical types).

### 4.2 Ports

```ts
// @agds/core/ports

export type Params = Record<string, unknown>;

export interface GraphStore {
  executeRead<T>(cypher: string, params: Params): Promise<T[]>;
  executeWrite<T>(cypher: string, params: Params): Promise<T[]>;
  upsertDocument(doc: DocumentInput): Promise<Document>;
  upsertEdge(edge: EdgeInput): Promise<void>;
  // ...
}

/**
 * Storage-agnostic source of Markdown documents. Implementations may back
 * the vault with the filesystem, an RDBMS, a document database, an object
 * store, a Git provider, etc. The core never assumes paths are filesystem
 * paths — they are opaque, store-defined identifiers.
 */
export interface DocumentStore {
  readonly id: string;            // logical store id
  readonly vaultId: string;       // logical vault id
  readonly capabilities: {
    write: boolean;               // can persist edits
    watch: boolean;               // can emit change events
    transactions: boolean;        // supports atomic multi-doc writes
    stableKeys: boolean;          // storeKey survives renames
    vcs: "none" | "git";          // backing version-control system
  };

  list(filter?: ListFilter): AsyncIterable<DocumentRef>;
  read(ref: DocumentRef): Promise<DocumentBlob>;
  write(ref: DocumentRef, body: string, opts?: WriteOpts): Promise<DocumentBlob>;
  stat(ref: DocumentRef): Promise<DocumentStat>;
  delete?(ref: DocumentRef): Promise<void>;
  watch?(filter?: ListFilter): AsyncIterable<DocumentChange>;
}

export interface DocumentRef {
  storeId: string;
  storeKey: string;     // opaque
  path?: string;        // optional human-readable hint
}

export interface DocumentBlob {
  ref: DocumentRef;
  body: string;
  stat: DocumentStat;
}

export interface DocumentStat {
  hash: string;          // SHA-256 of normalized body
  bytes: number;
  storeVersion: string;  // mtime / etag / row version / commit SHA
}

export interface ListFilter {
  // Store-defined; FS uses globs, RDBMS uses a query, etc.
  raw?: unknown;
  since?: string;        // optional incremental marker
}

export interface WriteOpts {
  expectedVersion?: string; // optimistic concurrency token
  reason?: string;          // free-text audit annotation
}

export interface DocumentChange {
  ref: DocumentRef;
  kind: "created" | "updated" | "deleted" | "renamed";
  previousRef?: DocumentRef;
}

export interface LlmClient {
  complete<T>(req: StructuredRequest<T>): Promise<T>;
}

export interface StructuredRequest<T> {
  promptName: string;
  promptVersion: string;
  input: unknown;
  schema: import("zod").ZodType<T>;
  model?: string;
}

export interface Cache {
  get(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer, ttlSeconds?: number): Promise<void>;
}

export interface Clock { now(): Date; }
export interface Logger { /* pino-compatible subset */ }
```

Adapters implement these ports. Tests substitute in-memory fakes.

### 4.3 Interface Adapters

- **`@agds/cli`** (citty) — parses argv, calls the runtime composition
  root, formats results as JSON/table/cypher, maps `AgdsError` to exit
  codes. Owns the interactive TUI for `review` (via `@clack/prompts`).
- **`@agds/server`** (hono) — exposes the same services over HTTP/JSON.
  Started explicitly via `agds serve`.
- **`@agds/mcp`** (M7) — adapts the MCP protocol to core services.

All three adapters call the *same* service methods with the *same* zod
input schemas; the surface stays in sync because schemas are shared.

### 4.4 Consistency Model

Neo4j and the `DocumentStore` are two independent stores. AGDS does not
attempt distributed transactions across them. The consistency contract is:

- **Documents are authoritative; the graph is derived.** Any field that
  also exists in a document (links, tags, headings, summary) is recovered
  from the document on the next `sync`.
- **Writeback order** for `suggest` / `review`:
  1. Write the document via `DocumentStore.write`.
  2. Write the graph via `GraphStore.executeWrite`.
  3. If step 2 fails, log a reconciliation event and continue. The next
     `sync` cycle compares hashes and converges.
- **Invariant**: the graph may lag the documents by at most one `sync`
  cycle. It never diverges silently — hash comparison detects any drift.
- Stores that advertise `capabilities.transactions` MAY participate in a
  best-effort two-step protocol where the document write is staged and
  committed only after the graph write succeeds. Failure modes still
  resolve to "next sync wins."

---

## 5. CLI Specification

```text
agds init                                       # Create config, install constraints, check APOC
agds doctor                                     # Verify config, Neo4j connectivity, APOC, LLM key, schema
agds migrate                                    # Apply pending Neo4j schema migrations
agds sync [--vault <id>] [--target <ref>] [--since <marker>] [--dry-run] [--full]
agds query "<cypher>"                           # Read-only Cypher (default)
agds query --write "<cypher>"                   # Write Cypher (explicit opt-in + confirm)
agds suggest [--target <ref>] [--since <ref>] [--limit <n>] [--dry-run]
agds review [--target <ref>] [--type <REL>]    # Interactively accept/reject pending edges
agds summarize <ref> [--force]                  # Refresh a document's summary
agds resolve <link>                             # Resolve a link to a Document (JSON)
agds fetch <ref> [--section <slug>] [--format md|text|json]
agds neighbors <ref> [--type <REL>] [--depth <n>] [--status active|pending|any]
agds backlinks <ref>                            # List documents pointing at <ref>
agds types [--json]                             # List known relationship types
agds types describe <name>                      # Show registry entry for a type
agds types normalize                            # Run alias canonicalization pass
agds verify                                     # Lint: broken links, orphans, cycles, unknown types
agds export --format graphml|dot|cypher|json    # Snapshot the graph
agds import <file>                              # Restore a snapshot (refuses non-empty graph w/o --force)
agds prompts list|show|diff                     # Inspect bundled LLM prompts
agds unlock --force                             # Reclaim a stale advisory lock
agds serve [--host 127.0.0.1] [--port 7475] [--token <t>] [--cors <origin>]
agds serve-mcp                                  # Expose tools as an MCP server (M7)
```

Global flags: `--vault <id>`, `--format json|table|cypher`, `--quiet`,
`--verbose`, `--json-logs`, `--remote <url>`, `--token <t>`.
Default output format is JSON to ease LLM consumption.

`<ref>` accepts: a `DocumentRef` JSON, a store-key, or — when the active
adapter advertises a `path` hint — a path string for convenience.

### 5.1 Prompt Management

- LLM prompts live under `packages/core/prompts/<name>/<version>.md` with
  zod input/output schemas alongside.
- Each prompt carries a SHA-256 fingerprint; `LlmClient.complete` includes
  `{ promptName, promptVersion }` in the cache key so prompt edits
  invalidate the cache naturally.
- Prompts are written in English. Document bodies may be any language;
  the summarizer and suggester preserve the source language in
  user-facing fields (`summary`, `rationale`).
- `agds prompts list|show|diff` exposes bundled prompts for inspection.

---

## 6. Technology Selection

| Area | Candidates | Choice | Rationale |
|------|------------|--------|-----------|
| Language | TypeScript / Rust / Go | **TypeScript (Node.js 20+)** | Rich Markdown & LLM ecosystem; remark available |
| Package manager | pnpm | **pnpm** | Easy to grow into a monorepo |
| Markdown parsing | remark + unified + micromark extension | **remark** | AST extensibility and mdast stability |
| Neo4j driver | `neo4j-driver` (official) | **neo4j-driver** | Official, typed, stable |
| Neo4j plugins | APOC Core | **APOC Core** | Required for `apoc.create.relationship` with dynamic types |
| LLM | Anthropic Claude (`@anthropic-ai/sdk`) | **claude-opus-4-6 / sonnet-4-6 / haiku-4-5** | Structured output, tool use, cost tiers |
| Provider abstraction | homegrown | **thin adapter** | Room for alternate providers without lock-in |
| CLI framework | commander / citty / clipanion | **citty** | Lightweight, type-safe, ESM-friendly |
| HTTP framework | hono / fastify / express | **hono** | Tiny, typed, ESM-native, runs on Node/Bun/edge |
| OpenAPI from zod | `@hono/zod-openapi` | **@hono/zod-openapi** | Single source of truth for shapes |
| Config | `agds.config.ts` + zod | **zod** | Type-safe schema validation |
| Prompt/TUI | prompts / ink / clack | **@clack/prompts** | Pleasant for `review`, small footprint |
| Tests | vitest + testcontainers-node | **vitest + testcontainers** | Real Neo4j for integration tests |
| Logging | pino | **pino** | Structured JSON logs by default |
| Telemetry | OpenTelemetry SDK | **@opentelemetry/sdk-node** (optional) | Standard traces/metrics export |
| Release | changesets | **changesets** | Per-package semver |
| Runtime | Node.js 20+ | — | ESM-first |
| Neo4j runtime | Docker Compose | **docker compose** | Standardizes local development |

### 6.1 Alternatives Considered

- **SQLite + graph extension** — no Cypher, rejected.
- **Memgraph** — Cypher-compatible; kept as a future option behind the
  driver abstraction.
- **Rust implementation** — faster but weaker Markdown/LLM SDK ecosystem.
- **Kuzu (embedded graph DB)** — tempting for zero-setup, but its Cypher
  dialect and APOC-equivalent coverage are currently too limited for our
  dynamic-type requirements.

---

## 7. Data Flow

### 7.1 `sync` Flow

1. Load config and instantiate the configured `DocumentStore`. Acquire an
   advisory lock (`scope:"sync"`) via `MERGE (l:AgdsLock {scope:"sync"})`.
2. Enumerate `DocumentRef`s via `store.list(filter)`. Pass `--since` as
   `filter.since` so stores that support incremental enumeration can
   short-circuit. Compute `hash` from each blob; the store MAY supply a
   `storeVersion` so the body fetch can be skipped when the version is
   unchanged from the last sync.
3. Compare against the corresponding `Document.hash` in Neo4j. Cases:
   - **New** — insert `Document`, headings, tags, edges.
   - **Unchanged** — skip.
   - **Modified** — re-parse; diff headings and edges; upsert.
   - **Renamed** — if `capabilities.stableKeys`, just update fields. If
     not, fall back to hash-based rename detection (§3.1.1).
   - **Deleted** — mark `archived=true` (default) or delete (`--full`).
4. Edge diffing: compute the desired edge set from the AST and reconcile
   against the current set keyed by `(source, target, type, source_kind)`.
   Unreferenced edges from this document are removed.
5. Unresolved targets create `BROKEN_LINK` edges to `:MissingTarget` nodes.
6. All graph writes for a single document happen inside one
   `executeWrite` transaction. Document-side writes go through
   `DocumentStore.write`; if the store advertises
   `capabilities.transactions`, both are bundled into a store-side
   transaction. Otherwise the core uses the §4.4 reconciliation strategy.
7. Services check `store.capabilities.write` before attempting writeback.
   Read-only stores still support `sync`, `query`, `resolve`, `fetch`,
   `neighbors`, `backlinks`, and `suggest --dry-run`.
8. `--dry-run` prints the diff without writing; `--full` forces a re-walk
   ignoring hashes.
9. Release the advisory lock on completion (or on crash via TTL expiry).

### 7.2 `suggest` Flow

1. Select candidate documents (`--target`, `--since <git-ref>`, or all
   non-archived, excluding `agds.doNotSuggest`).
2. For each doc, load its neighborhood (existing edges up to depth 2) from
   Neo4j and a short excerpt.
3. Call the LLM with a structured-output contract:

   ```ts
   {
     suggestions: [{
       targetRef: DocumentRef | { hint: string },
       type: string,
       rationale: string,
       confidence: number,
       anchorText: string,
     }]
   }
   ```

4. Validate with zod. Drop candidates that (a) fall below the confidence
   threshold, (b) already exist as an active edge, or (c) already exist as
   a pending edge, unless `--refresh` is set.
5. For surviving candidates:
   - Append `[?[anchorText|TYPE](targetRef)]` inside the managed
     `<!-- agds:suggested-links -->` fence (§2.1).
   - Upsert the edge with `status:"pending"`.
   - Register any new `TYPE` in `RelationType`.
6. `--dry-run` skips both document and graph writes.

### 7.3 `resolve` / `fetch` Flow

1. Accept: raw `[[...]]` / `[?[...]]` token, `DocumentRef` JSON,
   `Document.id`, store key, `key#heading`, or bare title.
2. Normalization ladder (capability-aware):
   - if input parses as a `DocumentRef`, look it up directly;
   - if the store has `stableKeys`, try `storeKey` exact match;
   - if the store has a `path` hint convention (FS, Git), try the path
     ladder (exact → case-insensitive);
   - try `Document.id` exact;
   - try `Document.title` exact;
   - try `Heading.slug` within a document (for `#anchor`);
   - fuzzy match (edit distance) — reported with a warning.
3. On a heading anchor, slice the AST to that section.
4. `resolve` returns metadata (`id`, `ref`, `title`, outgoing edges
   summary). `fetch` additionally returns the body in the requested
   format. Both are exposed to the LLM so it can traverse links
   autonomously.
5. On miss: return a structured "broken link" result and upsert a
   `BROKEN_LINK` edge.

### 7.4 `review` Flow

1. Enumerate edges with `status:"pending"`, filtered by
   `--target`/`--type`.
2. For each, show source/target excerpts and the LLM's rationale; prompt
   accept / reject / skip / edit-type.
3. **Accept** — rewrite `[?[...]]` → `[[...]]` in the document, flip
   `status` to `active`, record `updatedAt`.
4. **Reject** — remove the `[?[...]]` token from the document, set
   `status:"rejected"`, keep `rationale` for learning.
5. **Edit-type** — change the edge type before acceptance; new type is
   registered.
6. All document rewrites are buffered and flushed atomically per document.

---

## 8. HTTP API

The HTTP adapter exposes the same service surface as the CLI. It is
started explicitly via `agds serve`; the server is **not** auto-started.
It binds to `127.0.0.1` by default.

### 8.1 Endpoints

JSON in/out, schemas shared with the CLI via `@agds/schema`.

```text
GET    /healthz
GET    /openapi.json
GET    /v1/types                                ?cursor=&limit=
GET    /v1/types/:name
POST   /v1/query                                { cypher, params?, write? }
POST   /v1/sync                                 { vault?, target?, since?, dryRun?, full? }
POST   /v1/suggest                              { target?, since?, limit?, dryRun? }
POST   /v1/review/decisions                     { decisions: [{ edgeId, action, type? }] }
GET    /v1/documents                            ?vault=&cursor=&limit=
GET    /v1/documents/:id
GET    /v1/documents/:id/content                ?section=<slug>&format=md|text|json
GET    /v1/documents/:id/neighbors              ?type=&depth=&status=&cursor=&limit=
GET    /v1/documents/:id/backlinks              ?cursor=&limit=
POST   /v1/resolve                              { link }
POST   /v1/fetch                                { target, section?, format? }
POST   /v1/summarize                            { target, force? }
POST   /v1/verify                               # Lint scan
GET    /v1/export                               ?format=graphml|dot|cypher|json
```

### 8.2 Cross-cutting

- **Auth**: bearer token from `--token` / `AGDS_API_TOKEN`. When unset,
  the server refuses to bind on any interface other than loopback.
- **TLS**: when `server.tls.cert` and `server.tls.key` are configured,
  the server speaks HTTPS. Otherwise it stays loopback-only. For public
  exposure use a reverse proxy (caddy/nginx).
- **Safety**: `POST /v1/query` with `write:true` is rejected unless
  `safety.writeQueries` allows it, mirroring the CLI.
- **Pagination**: cursor-based (`?cursor=&limit=`) for every list
  endpoint. Cursors are opaque base64-encoded JSON. Default `limit=50`,
  max `200`.
- **Rate limiting**: per-token token-bucket, configured under
  `server.rateLimit`.
- **Idempotency**: `Idempotency-Key` header on mutating endpoints
  (`/v1/sync`, `/v1/suggest`, `/v1/review/decisions`). Duplicate keys
  return the previous result for `server.idempotency.ttl`.
- **Errors**: `AgdsError` → `{ code, message, details }` with a stable
  HTTP status map (`400` user, `401` auth, `403` forbidden, `404` not
  found, `409` conflict, `422` validation, `429` rate-limited, `500`
  internal, `502` upstream LLM/Neo4j).
- **Streaming**: long operations (`sync`, `suggest`) support
  `Accept: text/event-stream` to emit progress events that mirror the
  CLI's `--json-logs`.
- **OpenAPI**: `@agds/schema` zod definitions are converted to an
  OpenAPI document served at `/openapi.json` so LLM/tooling clients get
  typed access for free.
- **Versioning**: `/v1` is stable. Breaking changes go to `/v2` with a
  documented deprecation window; multiple versions run side-by-side
  during migration.

### 8.3 CLI as a Thin Client

The CLI commands `query`, `sync`, `suggest`, etc. can target a running
server instead of a local composition root via `--remote http://host:port
--token …`. This makes the CLI a thin client when desired, while still
working standalone.

`--remote` security:

- The token is read from `AGDS_API_TOKEN` if `--token` is not given;
  never persisted to disk.
- TLS verification is mandatory unless `--insecure` is passed.

---

## 9. Configuration

`agds.config.ts` is a TypeScript module exporting an object validated by
a zod schema:

```ts
export default defineConfig({
  vault: {
    // Discriminated union; additional kinds ("postgres", "mongo", "s3",
    // "git") plug in without changes to @agds/core.
    store: {
      kind: "fs",
      roots: ["./docs"],
      include: ["**/*.md"],
      exclude: ["**/node_modules/**", "**/.git/**"],
      ignoreFile: ".agdsignore",
    },
  },
  neo4j: {
    url: "bolt://localhost:7687",
    username: "neo4j",
    password: process.env.NEO4J_PASSWORD!,
    database: "neo4j",
  },
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    summaryModel: "claude-haiku-4-5-20251001",
    maxConcurrency: 4,
    cacheDir: ".agds/cache",
    cacheTtlDays: 30,
    redact: ["secret", "token", "apiKey"],
  },
  embeddings: {
    // Optional. Vector indexes are created only when configured.
    provider: null,        // "anthropic" | "openai" | "voyage" | "fastembed"
    model: null,
    dimensions: null,
    cacheDir: ".agds/embeddings",
  },
  suggest: {
    confidenceThreshold: 0.6,
    maxPerDocument: 10,
    contextDepth: 2,
    defaultType: "RELATED_TO",
  },
  safety: {
    writeQueries: "deny",        // "deny" | "prompt" | "allow"
    requireCleanGit: true,       // ignored unless capabilities.vcs === "git"
  },
  server: {
    host: "127.0.0.1",
    port: 7475,
    token: process.env.AGDS_API_TOKEN,
    cors: [],
    tls: null,                   // { cert, key } | null
    rateLimit: { perMinute: 120 },
    idempotency: { ttl: "24h" },
  },
  telemetry: {
    otel: {
      enabled: false,
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    cost: {
      enabled: true,
      priceTable: ".agds/prices.json",
    },
  },
});
```

---

## 10. Security & Safety

- `query --write` is disabled by default; requires an explicit flag and
  an interactive confirmation. Controlled by `safety.writeQueries`.
- AGDS uses a read-only Neo4j session (`executeRead`) for `query` unless
  the write flag is set.
- LLM-generated Cypher, if ever enabled, is gated behind an allowlist of
  APOC procedures and pattern checks (no `CALL dbms.*`, no `LOAD CSV`,
  no raw `CREATE USER`).
- Dynamic relationship type names are validated against
  `^[A-Z][A-Z0-9_]{0,63}$` before being passed to
  `apoc.create.relationship`.
- Frontmatter fields listed in `llm.redact` are stripped before being
  sent to the LLM.
- `safety.requireCleanGit` aborts document rewrites when the working
  tree is dirty. **Ignored unless the active store advertises
  `capabilities.vcs === "git"`.**
- LLM outputs are validated with zod schemas before touching disk.
- API keys are read from env vars only; never written to config files
  or logs. pino redaction covers known secret fields.

---

## 11. Performance & Cost

- Hash-based incremental sync avoids reparsing unchanged documents.
- LLM calls are cached by `(model, promptName, promptVersion, prompt_hash,
  doc_hash)` in `llm.cacheDir`. TTL is `llm.cacheTtlDays`.
- Suggestion batches are rate-limited via `llm.maxConcurrency`. Per-call
  retry uses exponential backoff with full jitter.
- Neo4j calls retry on transient errors only (`Neo.TransientError.*`).
- Neighborhood queries use parameterized Cypher with explicit `LIMIT`.
- Long-running commands print structured progress events
  (`--json-logs`).
- **Concurrency control**: `sync`, `suggest`, and `review` acquire an
  advisory lock by upserting `(:AgdsLock {scope, holder, expiresAt})`.
  Stale locks past `expiresAt` are reclaimed automatically. Operators
  can force-release with `agds unlock --force`.
- **Cost telemetry**: every command emits a per-run summary of tokens
  consumed and estimated USD using `telemetry.cost.priceTable`.

---

## 12. Observability & Error Model

- Structured logs via pino. `--verbose` enables debug, `--json-logs`
  switches to newline-delimited JSON for machine consumption.
- **OpenTelemetry** (optional): when `telemetry.otel.enabled` is true,
  the runtime exports traces and metrics:
  - traces for every CLI command and HTTP request
  - metrics: `sync.duration`, `sync.documents`, `llm.latency`,
    `llm.tokens.in`, `llm.tokens.out`, `graph.query.duration`
- Every CLI command returns a deterministic exit code:
  `0` success, `1` user error, `2` config error, `3` Neo4j error,
  `4` LLM error, `5` document store error, `6` lock contention,
  `10` partial success (e.g. some documents failed to sync).
- Errors carry a stable `code` string suitable for scripting (e.g.
  `AGDS_GRAPH_BROKEN_LINK`, `AGDS_LLM_RATE_LIMITED`).

---

## 13. Testing Strategy

- **Unit tests** (vitest) — parser, link resolver, rewriter, registry
  normalization, capability gating.
- **Integration tests** — real Neo4j via `testcontainers-node` with
  APOC enabled; covers sync idempotency, dynamic type creation, and
  broken-link detection.
- **Golden tests** — sample vault fixture under `fixtures/vault/`
  exercised end-to-end.
- **Property tests** — edge diffing is idempotent: `sync ∘ sync = sync`.
- **DocumentStore conformance suite** — every adapter implementation
  runs the same suite (list/read/write/stat/delete/watch round-trips,
  capability honesty checks).
- **LLM tests** — recorded fixtures; live calls are opt-in via
  `AGDS_LIVE_LLM=1` and never run in CI.
- **LLM eval harness** — `packages/evals/` runs `suggest` against a
  golden suggestion set on the fixture vault and asserts precision /
  recall thresholds. Offline by default; replays recorded responses.
- **Security tests** — assert relationship-type regex rejects
  injection, write-query allowlist denies forbidden procedures.

---

## 14. Directory Layout

```text
AGDS/
├─ docs/
│  └─ PLANS.md
├─ packages/
│  ├─ core/                 # @agds/core — pure services, ports, domain types, prompts
│  │  └─ prompts/           #   versioned LLM prompts
│  ├─ schema/               # @agds/schema — zod schemas shared across adapters
│  ├─ adapter-neo4j/        # @agds/adapter-neo4j — GraphStore impl
│  │  └─ migrations/        #   numbered Cypher migrations
│  ├─ adapter-store-fs/     # @agds/adapter-store-fs — DocumentStore on the FS
│  │                        # future: adapter-store-postgres, -mongo, -s3, -git
│  ├─ adapter-anthropic/    # @agds/adapter-anthropic — LlmClient impl
│  ├─ runtime/              # @agds/runtime — composition root
│  ├─ cli/                  # @agds/cli — citty adapter (depends on runtime)
│  ├─ server/               # @agds/server — hono adapter (depends on runtime)
│  ├─ mcp/                  # @agds/mcp — MCP adapter (M7)
│  └─ evals/                # @agds/evals — LLM eval harness (private)
├─ fixtures/
│  └─ vault/                # sample Markdown vault for tests
├─ docker/
│  └─ docker-compose.yml    # Neo4j 5.x with APOC
├─ agds.config.ts
├─ CLAUDE.md
├─ package.json
└─ pnpm-workspace.yaml
```

---

## 15. Milestones

Each milestone closes with a measurable **Done when** checklist.

### M1 — Foundations

Monorepo, hexagonal package split (`core`/`schema`/`adapter-*`/`runtime`/
`cli`), ports defined, in-memory fakes for tests, Neo4j+APOC docker,
config loader, `init`, `doctor`, `migrate`, pino logging, error model.

**Done when**:

- `agds doctor` passes against a fresh `docker compose up`.
- All ports have in-memory fakes and a conformance suite.
- `pnpm test` runs zero-integration tests successfully.

### M2 — Parser & Sync

Micromark extension for `[[...]]` and `[?[...]]`, hash-based
`SyncService`, read-only `QueryService`, `--dry-run`, broken-link edges,
advisory locking.

**Done when**:

- `sync ∘ sync` is a no-op (property test).
- A fixture vault of ≥50 documents syncs in <5 s on reference hardware.
- Broken links are reported by `verify` and surfaced as
  `BROKEN_LINK` edges.

### M3 — Resolve & Fetch

`LinkResolver`, `DocumentFetcher`, `resolve`, `fetch`, `neighbors`,
`backlinks`, `verify`, `export`, `import`.

**Done when**:

- Round-trip `export | import --force` reproduces the graph byte-equal
  (modulo timestamps).
- `resolve` covers every step of the normalization ladder with tests.

### M4 — HTTP API

`@agds/server` (hono), endpoints mirroring services, OpenAPI generation
from shared zod schemas, bearer-token auth, pagination, idempotency,
TLS, `agds serve`, CLI `--remote` client mode.

**Done when**:

- `/openapi.json` validates and round-trips through `openapi-typescript`.
- A fuzz test confirms every endpoint rejects unknown bodies with `422`.
- `--remote` parity tests show identical CLI output local vs. remote.

### M5 — LLM Integration

`summarize`, `suggest`, structured-output validation, prompt/response
cache, dynamic relationship types via APOC, prompt registry, cost
telemetry.

**Done when**:

- On the fixture vault, `suggest --dry-run` yields ≥80 % of the golden
  suggestions within the configured confidence threshold.
- Re-running `summarize` with no body change is a cache hit.

### M6 — Review UX

Interactive `review` with `@clack/prompts`, document promotion,
rejection history, `types normalize`.

**Done when**:

- Accepting a suggestion in `review` produces byte-equal output to the
  hand-rewritten golden file.
- `types normalize` merges seeded synonyms into a single canonical type.

### M7 — Advanced

Embeddings + vector index, `serve-mcp`, MCP tool surface matching the
HTTP read subset.

**Done when**:

- A vector search returns expected top-k for the fixture corpus.
- An MCP client can list tools, call `agds.fetch`, and traverse links.

### M8 — Quality

Expanded tests, golden fixtures, docs, sample vault, performance tuning,
release pipeline (changesets).

**Done when**:

- ≥85 % line coverage in `@agds/core`.
- First public release tag is published from CI.

---

## 16. MCP Tool Surface

Exposed tools mirror the safe **read** subset of the CLI:

- `agds.query` (read-only Cypher)
- `agds.resolve`
- `agds.fetch`
- `agds.neighbors`
- `agds.backlinks`
- `agds.types` / `agds.types.describe`
- `agds.summarize` (gated by `mcp.allowWrites = true`)

Write-side commands (`sync`, `suggest`, `review`) are intentionally **not**
exposed over MCP in M7 — they remain human-driven. The opt-in flag
`mcp.allowWrites` is documented but defaults to `false`.

---

## 17. Risk Register

| Risk | L | I | Mitigation |
|------|---|---|------------|
| LLM mints many near-synonym relationship types | H | M | Normalization pass, alias registry, `types normalize` |
| Rename/move loses history on stores without stable keys | M | H | Hash-based rename detection (§3.1.1); stable-key fast path |
| APOC version drift across Neo4j upgrades | M | M | Pin APOC to Neo4j minor; `doctor` verifies both |
| LLM cost runaway on large vaults | M | H | `maxConcurrency`, cache, `suggest --limit`, cost telemetry |
| Two-store drift (graph vs documents) | M | M | Hash reconciliation on next `sync`; explicit consistency model (§4.4) |
| Concurrent `sync` runs corrupt state | L | H | Advisory lock (§11) |
| Dynamic rel-type name injection | L | H | Regex validation, APOC-only dynamic writes |
| Markdown managed-section collision | M | L | Fence markers + refuse-to-overwrite (§2.1) |
| Prompt regression after edits | M | M | Prompt versioning + eval harness (§13) |
| HTTP token leakage | L | H | Env-only token, loopback default, TLS guard |

---

## 18. Release & Versioning

- `changesets` for per-package semver.
- **Pre-1.0**: all `@agds/*` packages move in lockstep on a single
  version. The API surface is explicitly unstable.
- **Post-1.0**: independent versioning per package. `@agds/core` and
  `@agds/schema` follow strict semver; adapters track their backing
  technology's compatibility window.
- Public packages: `@agds/cli`, `@agds/core`, `@agds/schema`, all
  `@agds/adapter-*`. Private: `@agds/runtime`, `@agds/evals`,
  `fixtures/`.
- Releases are cut from CI on tagged commits; release notes are
  auto-generated from changeset entries.

---

## 19. Internationalization Policy

- Per `CLAUDE.md`, all repository artifacts (code, comments, docs,
  commit messages, CLI help text, log/error messages) are written in
  English.
- LLM prompts are English. Document bodies may be any language; the
  summarizer and suggester preserve the source language in user-facing
  output fields (`summary`, `rationale`).
- CLI `--format json` and HTTP responses are never localized: machine
  clients receive canonical English `code` strings and English
  `message` text. Human-facing localization is out of scope.

---

## 20. Open Questions

- Embedding provider default: OpenAI / Voyage / local (fastembed)?
- Should `agds verify` be a separate command or also run as a flag on
  `sync`?
- MCP write surface: ever exposed, or CLI/HTTP only forever?
- Multi-tenancy: explicitly out of scope, or merely deferred?
- Should `agds.config.ts` support multiple vaults in one process, or is
  one vault per process the simpler invariant?
- Suggestion placement: always under the managed section, or attempt
  inline placement when the LLM provides a source paragraph anchor?
- Per-vault encryption at rest for the LLM cache, or are filesystem
  permissions sufficient?
- One Neo4j database per vault, or a shared database keyed by `vaultId`?

### Resolved (recorded for posterity)

- **`.agdsignore` semantics** — gitignore-compatible subset; documented
  with the FS adapter.
- **LLM provider** — Claude is the default; abstraction kept for future
  alternates.
- **Neo4j deployment** — Docker Compose for local; managed offerings
  (Aura) work via the same driver.
- **`review` UX** — `@clack/prompts` (lightweight TUI), not full ink.
