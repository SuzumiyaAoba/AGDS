import type { DocumentBlob, DocumentRef, DocumentStat } from "../types/document.js";
import type {
  DocumentStore,
  DocumentStoreCapabilities,
} from "../ports/document-store.js";

interface StoredEntry {
  vaultId: string;
  blob: DocumentBlob;
}

/**
 * Volatile in-memory implementation of DocumentStore for use in unit tests.
 *
 * Documents are keyed by storeKey within a vault.
 * Link resolution does an exact-match on storeKey or path within the store.
 */
export class InMemoryDocumentStore implements DocumentStore {
  readonly storeId: string;
  readonly capabilities: DocumentStoreCapabilities = { stableKeys: true };

  /** Outer key: vaultId. Inner key: storeKey. */
  private readonly vaults = new Map<string, Map<string, StoredEntry>>();

  constructor(storeId = "mem") {
    this.storeId = storeId;
  }

  /** Seed the store with a document blob for use in tests. */
  seed(vaultId: string, blob: DocumentBlob): void {
    let vault = this.vaults.get(vaultId);
    if (vault === undefined) {
      vault = new Map();
      this.vaults.set(vaultId, vault);
    }
    vault.set(blob.ref.storeKey, { vaultId, blob });
  }

  async *list(vaultId: string): AsyncIterable<DocumentRef> {
    const vault = this.vaults.get(vaultId);
    if (vault === undefined) return;
    for (const entry of vault.values()) {
      yield entry.blob.ref;
    }
  }

  async read(ref: DocumentRef): Promise<DocumentBlob> {
    const entry = this.findEntry(ref);
    if (entry === undefined) {
      throw new Error(
        `InMemoryDocumentStore: ref not found: storeKey="${ref.storeKey}"`,
      );
    }
    return entry.blob;
  }

  async stat(ref: DocumentRef): Promise<DocumentStat> {
    const blob = await this.read(ref);
    return blob.stat;
  }

  async resolveLinkTarget(
    from: DocumentRef,
    rawTarget: string,
  ): Promise<DocumentRef | null> {
    const hashIdx = rawTarget.lastIndexOf("#");
    const target = hashIdx >= 0 ? rawTarget.slice(0, hashIdx) : rawTarget;
    if (target === "") return null;

    // Find the vault that owns the from-ref, then search within that vault.
    const vaultId = this.findVaultId(from);
    if (vaultId === undefined) return null;
    const vault = this.vaults.get(vaultId);
    if (vault === undefined) return null;
    for (const entry of vault.values()) {
      if (
        entry.blob.ref.storeKey === target ||
        entry.blob.ref.path === target
      ) {
        return entry.blob.ref;
      }
    }
    return null;
  }

  formatLinkTarget(_from: DocumentRef, to: DocumentRef): string {
    return to.path ?? to.storeKey;
  }

  private findEntry(ref: DocumentRef): StoredEntry | undefined {
    for (const vault of this.vaults.values()) {
      const entry = vault.get(ref.storeKey);
      if (entry !== undefined) return entry;
    }
    return undefined;
  }

  private findVaultId(ref: DocumentRef): string | undefined {
    for (const [vaultId, vault] of this.vaults) {
      if (vault.has(ref.storeKey)) return vaultId;
    }
    return undefined;
  }
}
