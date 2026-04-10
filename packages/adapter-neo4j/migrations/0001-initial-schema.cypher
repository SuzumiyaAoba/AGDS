// Migration 0001 — initial schema
// Creates all constraints, indexes, and the schemaVersion meta node.

CREATE CONSTRAINT doc_id       IF NOT EXISTS FOR (d:Document)     REQUIRE d.id   IS UNIQUE;
CREATE CONSTRAINT doc_storekey IF NOT EXISTS FOR (d:Document)     REQUIRE (d.vaultId, d.storeKey) IS UNIQUE;
CREATE CONSTRAINT heading_id   IF NOT EXISTS FOR (h:Heading)      REQUIRE h.id   IS UNIQUE;
CREATE CONSTRAINT tag_name     IF NOT EXISTS FOR (t:Tag)          REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT reltype_name IF NOT EXISTS FOR (r:RelationType) REQUIRE r.name IS UNIQUE;
CREATE CONSTRAINT missing_ref  IF NOT EXISTS FOR (m:MissingTarget) REQUIRE m.ref IS UNIQUE;
CREATE CONSTRAINT meta_key     IF NOT EXISTS FOR (m:AgdsMeta)     REQUIRE m.key  IS UNIQUE;
CREATE CONSTRAINT lock_scope   IF NOT EXISTS FOR (l:AgdsLock)     REQUIRE l.scope IS UNIQUE;
CREATE INDEX      doc_title    IF NOT EXISTS FOR (d:Document)     ON (d.title);
CREATE INDEX      doc_publicid IF NOT EXISTS FOR (d:Document)     ON (d.publicId);
CREATE INDEX      doc_path     IF NOT EXISTS FOR (d:Document)     ON (d.path);
