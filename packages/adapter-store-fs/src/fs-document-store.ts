import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type {
  DocumentBlob,
  DocumentRef,
  DocumentStat,
  DocumentStore,
  DocumentStoreCapabilities,
} from "@agds/core";
import { extractFrontmatter } from "@agds/core";

export interface FsDocumentStoreOptions {
  /**
   * Logical identifier for this adapter instance.
   * Stored in `DocumentRef.storeId` and `Document.storeId`.
   */
  storeId?: string;
  /**
   * Absolute path to the root directory of the vault.
   * All `storeKey` values are relative paths from this root.
   */
  vaultRoot: string;
  /**
   * File extensions to include (dot-prefixed). Defaults to `[".md"]`.
   */
  extensions?: string[];
  /**
   * Directory names to skip during recursive scan.
   * Defaults to `["node_modules", ".git"]`.
   */
  excludeDirs?: string[];
}

/** Convert a filesystem path to a forward-slash `storeKey`. */
function toStoreKey(vaultRoot: string, absPath: string): string {
  return relative(vaultRoot, absPath).split(sep).join("/");
}

/** Resolve a `storeKey` back to an absolute filesystem path. */
function toAbsPath(vaultRoot: string, storeKey: string): string {
  return resolve(vaultRoot, ...storeKey.split("/"));
}

/**
 * Filesystem-backed implementation of `DocumentStore`.
 *
 * Documents are enumerated from a single configured root directory.
 * `storeKey` is the relative path from the root (forward slashes).
 * `storeVersion` is the file's last-modified time as an ISO 8601 string.
 *
 * This adapter is read-only in plan 006. Document mutation support is
 * tracked separately.
 */
export class FsDocumentStore implements DocumentStore {
  readonly storeId: string;
  readonly capabilities: DocumentStoreCapabilities;

  private readonly vaultRoot: string;
  private readonly extensions: string[];
  private readonly excludeDirs: Set<string>;

  constructor(opts: FsDocumentStoreOptions) {
    this.storeId = opts.storeId ?? "fs";
    this.vaultRoot = resolve(opts.vaultRoot);
    this.extensions = opts.extensions ?? [".md"];
    this.excludeDirs = new Set(opts.excludeDirs ?? ["node_modules", ".git"]);
    this.capabilities = { stableKeys: false };
  }

  async *list(_vaultId: string): AsyncIterable<DocumentRef> {
    yield* this.walkDir(this.vaultRoot);
  }

  async read(ref: DocumentRef): Promise<DocumentBlob> {
    const absPath = toAbsPath(this.vaultRoot, ref.storeKey);
    const raw = await readFile(absPath, "utf8");
    const fileStat = await stat(absPath);
    return buildBlob(this.storeId, this.vaultRoot, absPath, raw, fileStat.mtimeMs);
  }

  async stat(ref: DocumentRef): Promise<DocumentStat> {
    const blob = await this.read(ref);
    return blob.stat;
  }

  async resolveLinkTarget(
    from: DocumentRef,
    rawTarget: string,
  ): Promise<DocumentRef | null> {
    // Strip any #anchor fragment before resolving.
    const hashIdx = rawTarget.lastIndexOf("#");
    const targetPath = hashIdx >= 0 ? rawTarget.slice(0, hashIdx) : rawTarget;

    if (targetPath === "") return null;

    // Resolve relative to the from-document's directory.
    const fromDir = dirname(toAbsPath(this.vaultRoot, from.storeKey));
    const candidate = resolve(fromDir, targetPath);

    // Security: ensure the resolved path stays within the vault root.
    const candidateRel = relative(this.vaultRoot, candidate);
    if (candidateRel.startsWith("..")) return null;

    // Check the file exists and is a regular file.
    try {
      const fileStat = await stat(candidate);
      if (!fileStat.isFile()) return null;
    } catch {
      return null;
    }

    const storeKey = toStoreKey(this.vaultRoot, candidate);
    return buildRef(this.storeId, storeKey);
  }

  formatLinkTarget(from: DocumentRef, to: DocumentRef): string {
    const fromDir = dirname(toAbsPath(this.vaultRoot, from.storeKey));
    const toAbs = toAbsPath(this.vaultRoot, to.storeKey);
    return relative(fromDir, toAbs).split(sep).join("/");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async *walkDir(dir: string): AsyncIterable<DocumentRef> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (this.excludeDirs.has(entry.name)) continue;
        yield* this.walkDir(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (!this.extensions.includes(extname(entry.name))) continue;
        const absPath = join(dir, entry.name);
        const storeKey = toStoreKey(this.vaultRoot, absPath);
        yield buildRef(this.storeId, storeKey);
      }
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildRef(storeId: string, storeKey: string): DocumentRef {
  return { storeId, storeKey, path: storeKey };
}

function buildBlob(
  storeId: string,
  vaultRoot: string,
  absPath: string,
  raw: string,
  mtimeMs: number,
): DocumentBlob {
  const { body } = extractFrontmatter(raw);
  const bodyBytes = Buffer.byteLength(body, "utf8");
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  const storeVersion = new Date(mtimeMs).toISOString();
  const storeKey = toStoreKey(vaultRoot, absPath);

  return {
    ref: buildRef(storeId, storeKey),
    body: raw,
    stat: { hash, bytes: bodyBytes, storeVersion },
  };
}
