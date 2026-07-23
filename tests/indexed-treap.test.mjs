import assert from "node:assert/strict";
import test from "node:test";

import { IndexedTreap } from "../lib/collaboration/indexed-treap.ts";

test("maintains indexed sequence order across mixed edits", () => {
  const tree = new IndexedTreap();
  const reference = [];
  let seed = 0x5eed1234;

  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let operation = 0; operation < 10_000; operation += 1) {
    const shouldInsert = reference.length === 0 || random() < 0.62;
    if (shouldInsert) {
      const index = Math.floor(random() * (reference.length + 1));
      const value = `value-${operation}`;
      tree.insert(index, `replica-a:${operation}`, value);
      reference.splice(index, 0, value);
    } else {
      const index = Math.floor(random() * reference.length);
      assert.equal(tree.remove(index), reference.splice(index, 1)[0]);
    }

    assert.equal(tree.length, reference.length);
    if (reference.length) {
      const sample = Math.floor(random() * reference.length);
      assert.equal(tree.at(sample), reference[sample]);
    }
  }

  assert.deepEqual(tree.toArray(), reference);
});

test("rejects invalid positions and duplicate stable keys", () => {
  const tree = new IndexedTreap();
  tree.insert(0, "replica-a:1", "a");
  assert.throws(() => tree.insert(2, "replica-a:2", "b"), RangeError);
  assert.throws(() => tree.insert(1, "replica-a:1", "duplicate"), /duplicate stable key/);
  assert.equal(tree.at(-1), undefined);
  assert.equal(tree.remove(4), undefined);
});
