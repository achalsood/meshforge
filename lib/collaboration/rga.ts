export const ROOT_ID = "@root";

export interface InsertOperation {
  type: "insert";
  id: string;
  parentId: string;
  value: string;
}

export interface DeleteOperation {
  type: "delete";
  id: string;
}

export type TextOperation = InsertOperation | DeleteOperation;

interface CharacterNode {
  id: string;
  parentId: string;
  value: string | null;
  deleted: boolean;
}

export interface ReplicatedTextMetrics {
  nodes: number;
  visible: number;
  tombstones: number;
  compactedTombstones: number;
  pendingInserts: number;
  pendingDeletes: number;
}

function insertSorted(values: string[], value: string): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < value) low = middle + 1;
    else high = middle;
  }
  if (values[low] !== value) values.splice(low, 0, value);
}

/**
 * Replicated Growable Array (RGA) with deterministic sibling ordering.
 * Inserts whose parents have not arrived are held until their dependency is
 * available. Deletes can arrive before inserts and remain idempotent.
 */
export class ReplicatedText {
  private readonly nodes = new Map<string, CharacterNode>();
  private readonly children = new Map<string, string[]>();
  private readonly pendingByParent = new Map<string, InsertOperation[]>();
  private readonly pendingDeletes = new Set<string>();

  static fromText(text: string): ReplicatedText {
    const document = new ReplicatedText();
    let parentId = ROOT_ID;
    Array.from(text).forEach((value, index) => {
      const id = `seed:${String(index).padStart(8, "0")}`;
      document.apply({ type: "insert", id, parentId, value });
      parentId = id;
    });
    return document;
  }

  apply(operation: TextOperation): boolean {
    if (operation.type === "delete") {
      const node = this.nodes.get(operation.id);
      if (!node) {
        this.pendingDeletes.add(operation.id);
        return false;
      }
      if (node.deleted) return false;
      node.deleted = true;
      return true;
    }

    if (this.nodes.has(operation.id)) return false;
    if (operation.parentId !== ROOT_ID && !this.nodes.has(operation.parentId)) {
      const pending = this.pendingByParent.get(operation.parentId) ?? [];
      if (!pending.some((candidate) => candidate.id === operation.id)) pending.push(operation);
      this.pendingByParent.set(operation.parentId, pending);
      return false;
    }

    const node: CharacterNode = {
      id: operation.id,
      parentId: operation.parentId,
      value: operation.value,
      deleted: this.pendingDeletes.delete(operation.id),
    };
    this.nodes.set(node.id, node);
    const siblings = this.children.get(node.parentId) ?? [];
    insertSorted(siblings, node.id);
    this.children.set(node.parentId, siblings);

    const dependents = this.pendingByParent.get(node.id);
    if (dependents) {
      this.pendingByParent.delete(node.id);
      dependents.sort((left, right) => left.id.localeCompare(right.id));
      for (const dependent of dependents) this.apply(dependent);
    }
    return true;
  }

  applyAll(operations: readonly TextOperation[]): number {
    let applied = 0;
    for (const operation of operations) if (this.apply(operation)) applied += 1;
    return applied;
  }

  edit(before: string, after: string, clientId: string, nextSequence: () => number): TextOperation[] {
    if (before === after) return [];
    let prefix = 0;
    const prefixLimit = Math.min(before.length, after.length);
    while (prefix < prefixLimit && before[prefix] === after[prefix]) prefix += 1;

    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - suffix - 1] === after[after.length - suffix - 1]
    ) suffix += 1;

    const visibleBefore = this.visibleIds();
    const operations: TextOperation[] = [];
    const deleteEnd = before.length - suffix;
    for (const id of visibleBefore.slice(prefix, deleteEnd)) {
      const operation: DeleteOperation = { type: "delete", id };
      this.apply(operation);
      operations.push(operation);
    }

    let parentId = prefix === 0 ? ROOT_ID : visibleBefore[prefix - 1];
    const inserted = after.slice(prefix, after.length - suffix);
    for (const value of Array.from(inserted)) {
      const operation: InsertOperation = {
        type: "insert",
        id: `${clientId}:${String(nextSequence()).padStart(12, "0")}`,
        parentId,
        value,
      };
      this.apply(operation);
      operations.push(operation);
      parentId = operation.id;
    }
    return operations;
  }

  toString(): string {
    let result = "";
    this.walk((node) => { if (!node.deleted && node.value !== null) result += node.value; });
    return result;
  }

  visibleIds(): string[] {
    const ids: string[] = [];
    this.walk((node) => { if (!node.deleted) ids.push(node.id); });
    return ids;
  }

  /**
   * Drops character payloads from deleted nodes while retaining their IDs and
   * parent links as structural anchors. Keeping anchors is what makes this
   * compaction safe when a delayed insert still references a deleted node.
   */
  compactTombstones(): number {
    let compacted = 0;
    for (const node of this.nodes.values()) {
      if (node.deleted && node.value !== null) {
        node.value = null;
        compacted += 1;
      }
    }
    return compacted;
  }

  metrics(): ReplicatedTextMetrics {
    let visible = 0;
    let tombstones = 0;
    let compactedTombstones = 0;
    for (const node of this.nodes.values()) {
      if (node.deleted) {
        tombstones += 1;
        if (node.value === null) compactedTombstones += 1;
      } else {
        visible += 1;
      }
    }
    let pendingInserts = 0;
    for (const pending of this.pendingByParent.values()) pendingInserts += pending.length;
    return {
      nodes: this.nodes.size,
      visible,
      tombstones,
      compactedTombstones,
      pendingInserts,
      pendingDeletes: this.pendingDeletes.size,
    };
  }

  private walk(visit: (node: CharacterNode) => void): void {
    const stack = [...(this.children.get(ROOT_ID) ?? [])].reverse();
    while (stack.length) {
      const id = stack.pop()!;
      const node = this.nodes.get(id);
      if (!node) continue;
      visit(node);
      const descendants = this.children.get(id);
      if (descendants) for (let index = descendants.length - 1; index >= 0; index -= 1) stack.push(descendants[index]);
    }
  }
}
