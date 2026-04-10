---
title: Document With Links
agds:
  id: doc-with-links
  tags:
    - architecture
    - core
author: test
---

# Document With Links

This document demonstrates AGDS link syntax.

## Explicit Links

A plain explicit link: [[See also](003-with-suggestions.md)].

An explicit link with a type: [[Implements|IMPLEMENTS](001-no-frontmatter.md)].

An explicit link with a heading anchor: [[Section A](001-no-frontmatter.md#section-a)].

A repeated link to the same target (first): [[See also](003-with-suggestions.md)].

A repeated link to the same target (second): [[See also](003-with-suggestions.md)].

## Suggestions Section

Inline suggestion: [?[Maybe related](001-no-frontmatter.md)].

<!-- agds:suggested-links start -->
[?[Managed suggestion](003-with-suggestions.md)]
[?[Typed suggestion|ELABORATES](001-no-frontmatter.md)]

<!-- agds:suggested-links end -->
