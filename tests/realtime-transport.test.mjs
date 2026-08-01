import assert from "node:assert/strict";
import test from "node:test";
import { encodeBinaryOperationEvent } from "../lib/collaboration/binary-codec.ts";
import { decodeRealtimeFrame } from "../lib/collaboration/realtime-transport.ts";

const operationEvent = {
  eventId: "client:ops:1",
  clientId: "client",
  kind: "operations",
  payload: { operations: [{ type: "insert", id: "client:000000000001", parentId: "@root", value: "x" }] },
  createdAt: 1_700_000_000_000,
};

test("decodes binary operation frames from ArrayBuffer and typed-array views", () => {
  const encoded = encodeBinaryOperationEvent(operationEvent);
  const arrayBufferFrame = decodeRealtimeFrame(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
  const typedArrayFrame = decodeRealtimeFrame(encoded);
  assert.equal(arrayBufferFrame.encoding, "binary");
  assert.equal(typedArrayFrame.encoding, "binary");
  assert.equal(arrayBufferFrame.event.eventId, operationEvent.eventId);
  assert.deepEqual(typedArrayFrame.event.payload, arrayBufferFrame.event.payload);
});

test("validates JSON collaboration batches and signaling packets", () => {
  const batch = decodeRealtimeFrame(JSON.stringify({
    type: "batch", roomId: "mesh-room", clientId: "client", events: [operationEvent],
  }));
  const signal = decodeRealtimeFrame(JSON.stringify({
    type: "signal", roomId: "mesh-room", clientId: "client", signal: { kind: "ready" },
  }));
  assert.equal(batch.encoding, "json");
  assert.equal(batch.packet.type, "batch");
  assert.equal(signal.encoding, "json");
  assert.equal(signal.packet.type, "signal");
});

test("rejects malformed, unknown, and oversized realtime frames", () => {
  assert.throws(() => decodeRealtimeFrame("{}"), /Unknown realtime frame type/);
  assert.throws(() => decodeRealtimeFrame(JSON.stringify({ type: "batch", roomId: "mesh-room" })), /Invalid realtime batch/);
  assert.throws(() => decodeRealtimeFrame("x".repeat(257_000)), /too large/);
});
