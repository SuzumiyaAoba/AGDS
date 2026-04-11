import type {
  BrokenLink,
  Document,
  DocumentId,
  GraphStore,
  Heading,
  Tag,
} from "@agds/core";

export interface VerifyServiceOptions {
  vaultId: string;
  graph: GraphStore;
}

export type VerifyIssueKind =
  | "broken_link"
  | "orphaned_heading"
  | "orphaned_tag";

export interface VerifyIssue {
  kind: VerifyIssueKind;
  message: string;
  docId?: DocumentId;
  context?: Record<string, unknown>;
}

export interface VerifyResult {
  issues: VerifyIssue[];
}

export class VerifyService {
  private readonly vaultId: string;
  private readonly graph: GraphStore;

  constructor(opts: VerifyServiceOptions) {
    this.vaultId = opts.vaultId;
    this.graph = opts.graph;
  }

  async verify(): Promise<VerifyResult> {
    const documents = await this.graph.listDocuments(this.vaultId);
    const docsById = new Map(documents.map((doc): [string, Document] => [doc.id, doc]));

    const [brokenLinksByDocument, orphanedHeadings, orphanedTags] =
      await Promise.all([
        Promise.all(
          documents.map(async (doc) => ({
            doc,
            links: await this.graph.listBrokenLinksFrom(doc.id),
          })),
        ),
        this.graph.listOrphanedHeadings(),
        this.graph.listOrphanedTags(),
      ]);

    const issues: VerifyIssue[] = [];

    for (const { doc, links } of brokenLinksByDocument) {
      for (const link of links) {
        issues.push(toBrokenLinkIssue(doc, link));
      }
    }

    for (const heading of orphanedHeadings) {
      issues.push(toOrphanedHeadingIssue(heading, docsById.get(heading.docId)));
    }

    for (const tag of orphanedTags) {
      issues.push(toOrphanedTagIssue(tag));
    }

    issues.sort(compareIssues);

    return { issues };
  }
}

function toBrokenLinkIssue(doc: Document, link: BrokenLink): VerifyIssue {
  const docRef = doc.path ?? doc.storeKey;
  const context: Record<string, unknown> = {
    occurrenceKey: link.occurrenceKey,
    rawTarget: link.rawTarget,
    reason: link.reason,
    storeKey: doc.storeKey,
  };
  if (doc.path !== undefined) {
    context["path"] = doc.path;
  }
  if (link.anchor !== undefined) {
    context["anchor"] = link.anchor;
  }

  return {
    kind: "broken_link",
    message: `Document "${docRef}" has a broken link to "${link.rawTarget}".`,
    docId: doc.id,
    context,
  };
}

function toOrphanedHeadingIssue(
  heading: Heading,
  doc?: Document,
): VerifyIssue {
  const context: Record<string, unknown> = {
    headingId: heading.id,
    level: heading.level,
    slug: heading.slug,
    text: heading.text,
    order: heading.order,
  };
  if (doc?.storeKey !== undefined) {
    context["storeKey"] = doc.storeKey;
  }
  if (doc?.path !== undefined) {
    context["path"] = doc.path;
  }

  return {
    kind: "orphaned_heading",
    message: `Heading "${heading.slug}" is not attached to any document node.`,
    docId: heading.docId,
    context,
  };
}

function toOrphanedTagIssue(tag: Tag): VerifyIssue {
  return {
    kind: "orphaned_tag",
    message: `Tag "${tag.name}" is not attached to any document node.`,
    context: {
      name: tag.name,
    },
  };
}

function compareIssues(left: VerifyIssue, right: VerifyIssue): number {
  return (
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.docId ?? "", right.docId ?? "") ||
    compareStrings(serializeContext(left.context), serializeContext(right.context)) ||
    compareStrings(left.message, right.message)
  );
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function serializeContext(context: Record<string, unknown> | undefined): string {
  if (context === undefined) return "";

  const entries = Object.entries(context).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return JSON.stringify(entries);
}
