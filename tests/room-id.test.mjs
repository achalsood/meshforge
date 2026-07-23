import assert from "node:assert/strict";
import test from "node:test";

import { roomSlug } from "../lib/collaboration/room-id.ts";

test("creates deterministic bounded room identifiers", () => {
  const scope = "owner/repository:main:src/index.ts";
  const room = roomSlug(scope);

  assert.equal(room, roomSlug(scope));
  assert.match(room, /^mesh-[a-f0-9]{32}$/);
  assert.ok(room.length <= 64);
});

test("separates repository, branch, file, and audio scopes", () => {
  const rooms = new Set([
    roomSlug("owner/repository:main:src/index.ts"),
    roomSlug("owner/repository:feature:src/index.ts"),
    roomSlug("owner/repository:main:src/other.ts"),
    roomSlug("owner/repository:audio"),
    roomSlug("other/repository:main:src/index.ts"),
  ]);

  assert.equal(rooms.size, 5);
});
