import assert from "node:assert/strict";
import test from "node:test";

import { isRealtimeSignalPacket, shouldInitiateOffer, signalTargetsPeer } from "../lib/collaboration/signaling.ts";

test("elects exactly one offerer for every peer pair", () => {
  const peers = ["01aa", "88bb", "ff00"];
  for (const left of peers) {
    for (const right of peers) {
      if (left === right) continue;
      assert.notEqual(shouldInitiateOffer(left, right), shouldInitiateOffer(right, left));
    }
  }
});

test("routes targeted and broadcast signaling without echoing to sender", () => {
  const base = { type: "signal", roomId: "room", clientId: "peer-a", signal: { kind: "ready" } };
  assert.equal(signalTargetsPeer(base, "peer-a"), false);
  assert.equal(signalTargetsPeer(base, "peer-b"), true);
  assert.equal(signalTargetsPeer({ ...base, targetClientId: "peer-b" }, "peer-b"), true);
  assert.equal(signalTargetsPeer({ ...base, targetClientId: "peer-c" }, "peer-b"), false);
});

test("validates room-scoped HTTP signaling packets", () => {
  const ready = { type: "signal", roomId: "room", clientId: "peer-a", signal: { kind: "ready" } };
  assert.equal(isRealtimeSignalPacket(ready, "room"), true);
  assert.equal(isRealtimeSignalPacket({ ...ready, roomId: "another-room" }, "room"), false);
  assert.equal(isRealtimeSignalPacket({ ...ready, clientId: "" }, "room"), false);
  assert.equal(isRealtimeSignalPacket({ ...ready, signal: { kind: "unknown" } }, "room"), false);
});
