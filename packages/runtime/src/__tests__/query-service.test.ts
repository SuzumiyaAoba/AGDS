import { describe, expect, it } from "vitest";
import { AgdsError, InMemoryGraphStore } from "@agds/core";
import { QueryService } from "../query-service.js";

function makeService(): QueryService {
  return new QueryService({ graph: new InMemoryGraphStore() });
}

// ── Read-only mode ────────────────────────────────────────────────────────────

describe("QueryService — read-only mode (default)", () => {
  const WRITE_QUERIES = [
    "CREATE (n:Node {name: 'test'}) RETURN n",
    "MERGE (d:Document {id: '1234567890abcdef'})",
    "MATCH (n) SET n.updated = true RETURN n",
    "MATCH (n {id: 'abc'}) DELETE n",
    "MATCH (n)-[r]->(m) DETACH DELETE n",
    "MATCH (n) REMOVE n.prop RETURN n",
    "DROP CONSTRAINT doc_id",
    // Mixed case
    "match (n) Create (m:Node) return m",
  ];

  for (const cypher of WRITE_QUERIES) {
    it(`rejects write query: ${cypher.slice(0, 40)}…`, async () => {
      const service = makeService();
      await expect(service.query(cypher)).rejects.toThrow(AgdsError);

      try {
        await service.query(cypher);
      } catch (err) {
        expect(err).toBeInstanceOf(AgdsError);
        expect((err as AgdsError).code).toBe("QUERY_WRITE_FORBIDDEN");
      }
    });
  }

  const READ_QUERIES = [
    "MATCH (d:Document) RETURN d",
    "MATCH (d:Document {id: $id}) RETURN d.title AS title",
    "MATCH (d:Document)-[r]->(t:Document) RETURN d, r, t",
    "RETURN 1 + 1 AS result",
  ];

  for (const cypher of READ_QUERIES) {
    it(`allows read query: ${cypher.slice(0, 50)}`, async () => {
      const service = makeService();
      // InMemoryGraphStore.query() always throws, but QueryService should
      // NOT throw QUERY_WRITE_FORBIDDEN for read queries.
      await expect(service.query(cypher)).rejects.not.toThrow(
        expect.objectContaining({ code: "QUERY_WRITE_FORBIDDEN" }),
      );
    });
  }
});

// ── Write mode ────────────────────────────────────────────────────────────────

describe("QueryService — write mode", () => {
  it("passes write queries through to the graph when { write: true }", async () => {
    const service = makeService();
    // InMemoryGraphStore.query() throws regardless, but QueryService should
    // not reject with QUERY_WRITE_FORBIDDEN.
    const error = await service
      .query("CREATE (n:Node) RETURN n", { write: true })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    // The error should come from InMemoryGraphStore, not from write rejection.
    if (error instanceof AgdsError) {
      expect((error as AgdsError).code).not.toBe("QUERY_WRITE_FORBIDDEN");
    } else {
      // Plain Error from InMemoryGraphStore — that's expected.
      expect((error as Error).message).toContain("InMemoryGraphStore");
    }
  });
});

// ── Error shape ───────────────────────────────────────────────────────────────

describe("QueryService — error shape", () => {
  it("includes the rejected cypher in error details", async () => {
    const service = makeService();
    const cypher = "CREATE (n:Test) RETURN n";

    try {
      await service.query(cypher);
      expect.fail("Expected AgdsError");
    } catch (err) {
      expect(err).toBeInstanceOf(AgdsError);
      const agdsErr = err as AgdsError;
      expect(agdsErr.code).toBe("QUERY_WRITE_FORBIDDEN");
      expect(agdsErr.details?.["cypher"]).toBe(cypher);
    }
  });
});
