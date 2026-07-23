import assert from "node:assert/strict";
import test from "node:test";

import { DomainError } from "../lib/server/errors.ts";
import { readJson } from "../lib/server/http.ts";

test("parses bounded JSON requests", async () => {
  const request = new Request("https://meshforge.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ value: 42 }),
  });

  assert.deepEqual(await readJson(request), { value: 42 });
});

test("rejects unsupported media types, malformed JSON, and oversized payloads", async () => {
  const cases = [
    new Request("https://meshforge.test/api", { method: "POST", body: "{}" }),
    new Request("https://meshforge.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    new Request("https://meshforge.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "too large" }),
    }),
  ];

  await assert.rejects(() => readJson(cases[0]), (error) => error instanceof DomainError && error.status === 415);
  await assert.rejects(() => readJson(cases[1]), (error) => error instanceof DomainError && error.status === 400);
  await assert.rejects(() => readJson(cases[2], 8), (error) => error instanceof DomainError && error.status === 413);
});
