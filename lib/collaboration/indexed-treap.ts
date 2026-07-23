/**
 * An implicit order-statistic treap for translating editor offsets to items.
 *
 * Expected complexity:
 * - at / insert / remove: O(log n)
 * - split / merge: O(log n)
 * - materialize: O(n)
 *
 * Priorities are derived from stable keys so benchmark and replica tests are
 * reproducible. Production CRDT identifiers are suitable stable keys.
 */

export type StableKey = `${string}:${number}`;

interface Node<T> {
  key: StableKey;
  value: T;
  priority: number;
  size: number;
  left: Node<T> | null;
  right: Node<T> | null;
}

function size<T>(node: Node<T> | null): number {
  return node?.size ?? 0;
}

function update<T>(node: Node<T>): Node<T> {
  node.size = 1 + size(node.left) + size(node.right);
  return node;
}

// FNV-1a keeps priorities deterministic without storing extra random state.
function priorityFor(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function split<T>(root: Node<T> | null, leftSize: number): [Node<T> | null, Node<T> | null] {
  if (!root) return [null, null];
  const rootIndex = size(root.left);
  if (leftSize <= rootIndex) {
    const [left, right] = split(root.left, leftSize);
    root.left = right;
    return [left, update(root)];
  }
  const [left, right] = split(root.right, leftSize - rootIndex - 1);
  root.right = left;
  return [update(root), right];
}

function merge<T>(left: Node<T> | null, right: Node<T> | null): Node<T> | null {
  if (!left) return right;
  if (!right) return left;
  if (left.priority >= right.priority) {
    left.right = merge(left.right, right);
    return update(left);
  }
  right.left = merge(left, right.left);
  return update(right);
}

export class IndexedTreap<T> implements Iterable<T> {
  private root: Node<T> | null = null;
  private readonly keys = new Set<StableKey>();

  get length(): number {
    return size(this.root);
  }

  at(index: number): T | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined;
    let node = this.root;
    let offset = index;
    while (node) {
      const leftSize = size(node.left);
      if (offset === leftSize) return node.value;
      if (offset < leftSize) node = node.left;
      else {
        offset -= leftSize + 1;
        node = node.right;
      }
    }
    return undefined;
  }

  insert(index: number, key: StableKey, value: T): void {
    if (!Number.isInteger(index) || index < 0 || index > this.length) {
      throw new RangeError(`index ${index} is outside 0..${this.length}`);
    }
    if (this.keys.has(key)) throw new Error(`duplicate stable key: ${key}`);
    const node: Node<T> = { key, value, priority: priorityFor(key), size: 1, left: null, right: null };
    const [left, right] = split(this.root, index);
    this.root = merge(merge(left, node), right);
    this.keys.add(key);
  }

  remove(index: number): T | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined;
    const [left, tail] = split(this.root, index);
    const [removed, right] = split(tail, 1);
    this.root = merge(left, right);
    if (!removed) return undefined;
    this.keys.delete(removed.key);
    return removed.value;
  }

  *[Symbol.iterator](): Iterator<T> {
    const stack: Node<T>[] = [];
    let current = this.root;
    while (current || stack.length) {
      while (current) {
        stack.push(current);
        current = current.left;
      }
      current = stack.pop()!;
      yield current.value;
      current = current.right;
    }
  }

  toArray(): T[] {
    return [...this];
  }
}
