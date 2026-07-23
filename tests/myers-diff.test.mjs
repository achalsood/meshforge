import assert from "node:assert/strict";
import test from "node:test";

import { myersDiffStats } from "../lib/repository/myers-diff.ts";

test("counts line insertions and deletions using the shortest edit path", () => {
  assert.deepEqual(myersDiffStats("a\nb\nc\n", "a\nx\nc\nd\n"), {
    insertions: 2,
    deletions: 1,
    unchanged: 2,
  });
});

test("handles empty files and identical snapshots", () => {
  assert.deepEqual(myersDiffStats("", "one\ntwo\n"), { insertions: 2, deletions: 0, unchanged: 0 });
  assert.deepEqual(myersDiffStats("same\n", "same\n"), { insertions: 0, deletions: 0, unchanged: 1 });
  assert.deepEqual(myersDiffStats("one\ntwo\n", ""), { insertions: 0, deletions: 2, unchanged: 0 });
});
