/**
 * Cypher statement builders for all graph write/read operations.
 *
 * Each function returns a `{ text, parameters }` object ready for
 * `session.run(stmt.text, stmt.parameters)`. Parameters are named and typed
 * to avoid string interpolation, which would open injection vectors.
 */

// ── Documents ────────────────────────────────────────────────────────────────

export const UPSERT_DOCUMENT = `
MERGE (d:Document {vaultId: $vaultId, storeKey: $storeKey})
SET d.id            = $id,
    d.publicId      = $publicId,
    d.storeId       = $storeId,
    d.path          = $path,
    d.title         = $title,
    d.hash          = $hash,
    d.bytes         = $bytes,
    d.storeVersion  = $storeVersion,
    d.updatedAt     = $updatedAt,
    d.summary       = $summary,
    d.archived      = false,
    d.schemaVersion = $schemaVersion
RETURN d.id AS id
`;

export const ARCHIVE_DOCUMENT = `
MATCH (d:Document {id: $id})
SET d.archived = true
`;

export const FIND_DOCUMENT_BY_ID = `
MATCH (d:Document {id: $id})
RETURN d
`;

export const FIND_DOCUMENT_BY_REF = `
MATCH (d:Document {vaultId: $vaultId, storeId: $storeId, storeKey: $storeKey})
RETURN d
`;

export const FIND_DOCUMENT_BY_PUBLIC_ID = `
MATCH (d:Document {vaultId: $vaultId, publicId: $publicId})
WHERE d.archived = false
RETURN d
`;

export const LIST_DOCUMENTS = `
MATCH (d:Document {vaultId: $vaultId})
WHERE d.archived = false
RETURN d
`;

// ── Headings ─────────────────────────────────────────────────────────────────

/**
 * Replace all headings for a document atomically:
 * 1. Detach and delete existing HAS_HEADING edges (and orphan Heading nodes).
 * 2. Create new Heading nodes and HAS_HEADING edges.
 *
 * DISTINCT is required after the delete step: OPTIONAL MATCH returns one row
 * per matched heading, so without DISTINCT the subsequent UNWIND would produce
 * N_old × N_new rows and attempt to CREATE each new heading N_old times,
 * causing a unique-constraint violation on Heading.id.
 */
export const REPLACE_HEADINGS = `
MATCH (d:Document {id: $docId})
OPTIONAL MATCH (d)-[r:HAS_HEADING]->(h:Heading)
DETACH DELETE h
WITH DISTINCT d
UNWIND $headings AS heading
CREATE (h:Heading {
  id:    heading.id,
  docId: $docId,
  level: heading.level,
  text:  heading.text,
  slug:  heading.slug,
  order: heading.order
})
CREATE (d)-[:HAS_HEADING]->(h)
`;

// ── Tags ─────────────────────────────────────────────────────────────────────

/**
 * Replace tag associations for a document:
 * 1. Remove existing HAS_TAG edges from the document.
 * 2. Merge Tag nodes (global, shared across documents).
 * 3. Create new HAS_TAG edges.
 *
 * DISTINCT is required after the delete step for the same reason as
 * REPLACE_HEADINGS: without it, UNWIND produces N_old × N_new rows and
 * creates duplicate HAS_TAG edges.
 */
export const REPLACE_TAGS = `
MATCH (d:Document {id: $docId})
OPTIONAL MATCH (d)-[r:HAS_TAG]->(:Tag)
DELETE r
WITH DISTINCT d
UNWIND $tags AS tagName
MERGE (t:Tag {name: tagName})
CREATE (d)-[:HAS_TAG]->(t)
`;

// ── Semantic edges ────────────────────────────────────────────────────────────

/**
 * Upsert a semantic edge using APOC (required for dynamic relationship types).
 *
 * Identity: (sourceDocId, targetDocId, type, occurrenceKey).
 * If an edge with the same occurrenceKey already exists, its mutable
 * properties (status, confidence, rationale, updatedAt) are updated.
 */
export const UPSERT_SEMANTIC_EDGE = `
MATCH (src:Document {id: $sourceDocId})
MATCH (tgt:Document {id: $targetDocId})
CALL apoc.merge.relationship(
  src,
  $type,
  {occurrenceKey: $occurrenceKey},
  {
    source:      $source,
    status:      $status,
    confidence:  $confidence,
    rationale:   $rationale,
    anchor:      $anchor,
    createdAt:   $createdAt,
    updatedAt:   $updatedAt,
    model:       $model
  },
  tgt,
  {}
) YIELD rel
RETURN rel
`;

export const DELETE_SEMANTIC_EDGE = `
MATCH ()-[r {occurrenceKey: $occurrenceKey}]->()
DELETE r
`;

export const LIST_EDGES_FROM = `
MATCH (src:Document {id: $docId})-[r]->(:Document)
WHERE r.occurrenceKey IS NOT NULL
RETURN
  r.occurrenceKey AS occurrenceKey,
  src.id          AS sourceDocId,
  endNode(r).id   AS targetDocId,
  type(r)         AS type,
  r.source        AS source,
  r.status        AS status,
  r.confidence    AS confidence,
  r.rationale     AS rationale,
  r.anchor        AS anchor,
  r.createdAt     AS createdAt,
  r.updatedAt     AS updatedAt,
  r.model         AS model
`;

export const LIST_EDGES_TO = `
MATCH (:Document)-[r]->(tgt:Document {id: $docId})
WHERE r.occurrenceKey IS NOT NULL
RETURN
  r.occurrenceKey   AS occurrenceKey,
  startNode(r).id   AS sourceDocId,
  tgt.id            AS targetDocId,
  type(r)           AS type,
  r.source          AS source,
  r.status          AS status,
  r.confidence      AS confidence,
  r.rationale       AS rationale,
  r.anchor          AS anchor,
  r.createdAt       AS createdAt,
  r.updatedAt       AS updatedAt,
  r.model           AS model
`;

// ── Broken links ────────────────────────────────────────────────────────────

export const UPSERT_BROKEN_LINK = `
MATCH (src:Document {id: $sourceDocId})
MERGE (missing:MissingTarget {ref: $rawTarget})
MERGE (src)-[rel:BROKEN_LINK {occurrenceKey: $occurrenceKey}]->(missing)
ON CREATE SET
  rel.anchor      = $anchor,
  rel.reason      = $reason,
  rel.createdAt   = $createdAt,
  rel.updatedAt   = $updatedAt
ON MATCH SET
  rel.anchor      = $anchor,
  rel.reason      = $reason,
  rel.updatedAt   = $updatedAt
RETURN rel
`;

export const DELETE_BROKEN_LINK = `
MATCH ()-[r:BROKEN_LINK {occurrenceKey: $occurrenceKey}]->(missing:MissingTarget)
DELETE r
WITH missing
WHERE NOT EXISTS { MATCH ()-[:BROKEN_LINK]->(missing) }
DELETE missing
`;

export const LIST_BROKEN_LINKS_FROM = `
MATCH (src:Document {id: $docId})-[r:BROKEN_LINK]->(missing:MissingTarget)
RETURN
  r.occurrenceKey AS occurrenceKey,
  src.id          AS sourceDocId,
  missing.ref     AS rawTarget,
  r.anchor        AS anchor,
  r.reason        AS reason,
  r.createdAt     AS createdAt,
  r.updatedAt     AS updatedAt
`;

export const LIST_HEADINGS_FOR_DOCUMENT = `
MATCH (d:Document {id: $docId})-[:HAS_HEADING]->(h:Heading)
RETURN
  h.id    AS id,
  h.docId AS docId,
  h.level AS level,
  h.text  AS text,
  h.slug  AS slug,
  h.order AS order
ORDER BY h.order
`;

export const LIST_ORPHANED_HEADINGS = `
MATCH (h:Heading)
WHERE NOT EXISTS { MATCH (:Document)-[:HAS_HEADING]->(h) }
RETURN
  h.id    AS id,
  h.docId AS docId,
  h.level AS level,
  h.text  AS text,
  h.slug  AS slug,
  h.order AS order
`;

export const LIST_ORPHANED_TAGS = `
MATCH (t:Tag)
WHERE NOT EXISTS { MATCH (:Document)-[:HAS_TAG]->(t) }
RETURN t.name AS name
`;

// ── Advisory locks ────────────────────────────────────────────────────────────

export const ACQUIRE_LOCK = `
MERGE (l:AgdsLock {scope: $scope})
ON CREATE SET
  l.holder      = $holder,
  l.acquiredAt  = $acquiredAt,
  l.expiresAt   = $expiresAt
ON MATCH SET
  l.holder      = CASE WHEN l.expiresAt < $now OR l.holder = $holder
                       THEN $holder      ELSE l.holder      END,
  l.acquiredAt  = CASE WHEN l.expiresAt < $now OR l.holder = $holder
                       THEN $acquiredAt  ELSE l.acquiredAt  END,
  l.expiresAt   = CASE WHEN l.expiresAt < $now OR l.holder = $holder
                       THEN $expiresAt   ELSE l.expiresAt   END
RETURN l.holder AS holder, l.expiresAt AS expiresAt
`;

export const RELEASE_LOCK = `
MATCH (l:AgdsLock {scope: $scope})
DELETE l
`;

// ── Schema version ────────────────────────────────────────────────────────────

export const GET_SCHEMA_VERSION = `
MATCH (m:AgdsMeta {key: "schemaVersion"})
RETURN m.value AS version
`;

export const SET_SCHEMA_VERSION = `
MERGE (m:AgdsMeta {key: "schemaVersion"})
SET m.value = $version
`;

// ── APOC check ────────────────────────────────────────────────────────────────

export const CHECK_APOC = `
RETURN apoc.version() AS version
`;
