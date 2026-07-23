import assert from "node:assert/strict";
import test from "node:test";

import { ReplicatedText } from "../lib/collaboration/rga.ts";

function shuffled(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

test("converges when concurrent edits arrive in different orders", () => {
  const initial = "vector search";
  const sources = ["replica-a", "replica-b", "replica-c"].map(() => ReplicatedText.fromText(initial));
  const counters = [0, 0, 0];
  const operations = [
    sources[0].edit(initial, "fast vector search", "replica-a", () => ++counters[0]),
    sources[1].edit(initial, "vector similarity search", "replica-b", () => ++counters[1]),
    sources[2].edit(initial, "vector-search", "replica-c", () => ++counters[2]),
  ].flat();

  const results = Array.from({ length: 50 }, (_, index) => {
    const replica = ReplicatedText.fromText(initial);
    replica.applyAll(shuffled(operations, index + 1));
    replica.applyAll(shuffled(operations, index + 101)); // duplicate replay is harmless
    return replica.toString();
  });

  assert.equal(new Set(results).size, 1);
});

test("resolves inserts and deletes received before their dependencies", () => {
  const replica = ReplicatedText.fromText("");
  const operations = [
    { type: "delete", id: "peer:0002" },
    { type: "insert", id: "peer:0003", parentId: "peer:0002", value: "c" },
    { type: "insert", id: "peer:0002", parentId: "peer:0001", value: "b" },
    { type: "insert", id: "peer:0001", parentId: "@root", value: "a" },
  ];
  replica.applyAll(operations);
  assert.equal(replica.toString(), "ac");
});

test("compacts deleted payloads without removing causal anchors", () => {
  const operations = [
    { type: "insert", id: "peer:0001", parentId: "@root", value: "a" },
    { type: "insert", id: "peer:0002", parentId: "peer:0001", value: "b" },
    { type: "delete", id: "peer:0001" },
  ];
  const compacted = ReplicatedText.fromText("");
  const reference = ReplicatedText.fromText("");
  compacted.applyAll(operations);
  reference.applyAll(operations);

  assert.equal(compacted.compactTombstones(), 1);
  assert.equal(compacted.compactTombstones(), 0);
  assert.deepEqual(compacted.metrics(), {
    nodes: 2,
    visible: 1,
    tombstones: 1,
    compactedTombstones: 1,
    pendingInserts: 0,
    pendingDeletes: 0,
  });

  const delayed = { type: "insert", id: "peer:0003", parentId: "peer:0001", value: "c" };
  compacted.apply(delayed);
  reference.apply(delayed);
  assert.equal(compacted.toString(), "bc");
  assert.equal(compacted.toString(), reference.toString());
});
