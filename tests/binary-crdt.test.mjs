import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeBinaryOperationEvent,
  decodeOperations,
  encodeBinaryOperationEvent,
  encodeOperations,
  operationPayload,
  operationsFromPayload,
} from "../lib/collaboration/binary-codec.ts";

function operationFixture() {
  const operations = [];
  let parentId = "@root";
  for (let index = 1; index <= 80; index += 1) {
    const id = `replica-a:${String(index).padStart(12, "0")}`;
    operations.push({ type: "insert", id, parentId, value: String.fromCharCode(96 + (index % 26 || 26)) });
    parentId = id;
  }
  for (let index = 10; index <= 40; index += 2) {
    operations.push({ type: "delete", id: `replica-a:${String(index).padStart(12, "0")}` });
  }
  return operations;
}

test("binary CRDT v1 round-trips inserts and deletes", () => {
  const operations = operationFixture();
  assert.deepEqual(decodeOperations(encodeOperations(operations)), operations);
});

test("binary CRDT encoding is materially smaller than JSON for an edit batch", () => {
  const operations = operationFixture();
  const binaryBytes = encodeOperations(operations).byteLength;
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ operations })).byteLength;
  assert.ok(binaryBytes < jsonBytes * 0.45, `${binaryBytes} binary bytes should beat ${jsonBytes} JSON bytes`);
});

test("binary operation events survive WebSocket framing and JSON fallback", () => {
  const operations = operationFixture().slice(0, 12);
  const event = {
    eventId: "replica-a:ops:81",
    clientId: "replica-a",
    kind: "operations",
    payload: operationPayload(operations),
    createdAt: 1_753_000_000_123,
  };
  const decoded = decodeBinaryOperationEvent(encodeBinaryOperationEvent(event));
  assert.equal(decoded.eventId, event.eventId);
  assert.equal(decoded.clientId, event.clientId);
  assert.equal(decoded.createdAt, event.createdAt);
  assert.deepEqual(operationsFromPayload(decoded.payload), operations);
  assert.deepEqual(operationsFromPayload(event.payload), operations);
});

test("binary decoder rejects malformed or trailing data", () => {
  assert.throws(() => decodeOperations(Uint8Array.of(0x4d, 0x46, 0x02)), /Unsupported|Unexpected/);
  const valid = encodeOperations(operationFixture().slice(0, 1));
  const trailing = new Uint8Array(valid.length + 1);
  trailing.set(valid);
  assert.throws(() => decodeOperations(trailing), /Trailing bytes/);
});
