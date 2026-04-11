---
agds:
  id: overview
  tags: [agds, introduction]
title: AGDS Overview
---

# AGDS Overview

**AGDS** (Automated Graph Document System) manages a collection of Markdown
documents as a knowledge graph stored in [Neo4j](https://neo4j.com/).

## What it does

- Parse Markdown documents and extract structure (titles, headings, links, tags)
- Store documents and their relationships as nodes and edges in Neo4j
- Allow an LLM to propose new relationships between documents
- Expose the graph for querying via Cypher or the CLI

## Core concepts

- [[Vault|DESCRIBES](vault.md)] — the directory of Markdown documents
- [[Document Identity|DESCRIBES](document-identity.md)] — how documents are
  uniquely identified in the graph
- [[Link Syntax|DESCRIBES](link-syntax.md)] — how to express relationships
  inside Markdown
- [[Architecture|DESCRIBES](architecture.md)] — how the system is structured

## Getting started

See [[Quickstart|REFERENCES](quickstart.md)] for a step-by-step guide from
installation to your first `agds sync`.
