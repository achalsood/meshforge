import assert from "node:assert/strict";
import test from "node:test";

import { repositoryObjectId, utf8Bytes } from "../lib/repository/object-id.ts";

test("content addressing is stable, typed, and sensitive to payload changes", async () => {
  const first = await repositoryObjectId("blob", "hello");
  assert.equal(first, await repositoryObjectId("blob", "hello"));
  assert.notEqual(first, await repositoryObjectId("blob", "hello!"));
  assert.notEqual(first, await repositoryObjectId("tree", "hello"));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("object lengths use UTF-8 bytes rather than JavaScript code units", () => {
  assert.equal(utf8Bytes("é"), 2);
  assert.equal(utf8Bytes("mesh"), 4);
});
